
import { AgentContext, ChatMessage, LLMProvider } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';

export class AgentOrchestrator {
    private context: AgentContext;

    constructor(
        private llm: LLMProvider,
        private tools: ToolGateway,
        workspaceRoot: string
    ) {
        this.context = {
            workspaceRoot,
            history: [
                { role: 'system', content: this.getSystemPrompt() }
            ]
        };
    }



    private getSystemPrompt(): string {
        const toolDefs = this.tools.getToolDefinitions().map((t: ToolDefinition) => {
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

    async chat(userMessage: string): Promise<string> {
        // 1. Add user message
        this.context.history.push({ role: 'user', content: userMessage });

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
            } catch (e) {
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
                        const result = await this.tools.executeTool(call as ToolCall);
                        this.context.history.push({
                            role: 'tool',
                            content: JSON.stringify(result)
                        });
                    } catch (error: any) {
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
            } else {
                // Just thought/JSON response without tools
                this.context.history.push({ role: 'assistant', content: responseText });
                return parsed.thought || responseText;
            }
        }

        return "Max turns reached.";
    }
}
