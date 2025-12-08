"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const context_manager_1 = require("./context_manager");
class AgentOrchestrator {
    constructor(llm, tools, workspaceRoot) {
        this.llm = llm;
        this.tools = tools;
        this.contextManager = new context_manager_1.ContextManager();
        this.context = {
            workspaceRoot,
            history: [
                { role: 'system', content: this.getSystemPrompt() }
            ]
        };
    }
    getSystemPrompt() {
        const toolDefs = this.tools.getToolDefinitions().map((t) => {
            return `## ${t.name}\n${t.description}\nParameters: ${JSON.stringify(t.parameters)}`;
        }).join('\n\n');
        return `You are Vibey, an expert coding agent.
You are running inside VS Code.
You have access to the following tools:

${toolDefs}

ALWAYS use these tools to perform actions.
When you need to use a tool, output a JSON block matching the tool schema.
Response format:
\`\`\`json
{
  "thought": "Reasoning...",
  "tool_calls": [
    {
      "id": "unique_id",
      "name": "tool_name",
      "parameters": { ... }
    }
  ]
}
\`\`\`
Do not write normal text if you are using a tool. Output ONLY the JSON block.
`;
    }
    async chat(userMessage, contextItems) {
        // Resolve context if any
        let fullMessage = userMessage;
        if (contextItems && contextItems.length > 0) {
            const contextBlock = await this.contextManager.resolveContext(contextItems);
            fullMessage += contextBlock;
        }
        // 1. Add user message
        this.context.history.push({ role: 'user', content: fullMessage });
        let turns = 0;
        const MAX_TURNS = 10;
        while (turns < MAX_TURNS) {
            turns++;
            // 2. Call LLM
            const responseText = await this.llm.chat(this.context.history);
            // 3. Parse Response
            // Check for JSON block
            const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // No tool call, just a text response.
                this.context.history.push({ role: 'assistant', content: responseText });
                return responseText;
            }
            // Valid JSON candidate
            let parsed;
            try {
                const jsonStr = jsonMatch[1] || jsonMatch[0];
                parsed = JSON.parse(jsonStr);
            }
            catch (e) {
                // Failed to parse, return raw text
                this.context.history.push({ role: 'assistant', content: responseText });
                return responseText;
            }
            // 4. Execute Tools
            if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                this.context.history.push({ role: 'assistant', content: responseText });
                // Execute sequentially
                for (const call of parsed.tool_calls) {
                    try {
                        const result = await this.tools.executeTool(call);
                        this.context.history.push({
                            role: 'tool',
                            content: JSON.stringify(result)
                        });
                    }
                    catch (error) {
                        this.context.history.push({
                            role: 'tool',
                            content: JSON.stringify({
                                role: 'tool_result',
                                tool_call_id: call.id,
                                status: 'error',
                                error: error.message
                            })
                        });
                    }
                }
                // Loop continues to let LLM see tool output
            }
            else {
                // Just thought/JSON response without tools
                this.context.history.push({ role: 'assistant', content: responseText });
                return parsed.thought || responseText;
            }
        }
        return "Max turns reached.";
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=orchestrator.js.map