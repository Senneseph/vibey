"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentOrchestrator = void 0;
const vscode = __importStar(require("vscode"));
const context_manager_1 = require("./context_manager");
class AgentOrchestrator {
    cancel() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
    constructor(llm, tools, workspaceRoot) {
        this.llm = llm;
        this.tools = tools;
        this.abortController = null;
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
    async chat(userMessage, contextItems, onUpdate) {
        // Cancel any previous running request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        try {
            // Resolve context if any
            let fullMessage = userMessage;
            if (contextItems && contextItems.length > 0) {
                const contextBlock = await this.contextManager.resolveContext(contextItems);
                fullMessage += contextBlock;
            }
            // 1. Add user message
            this.context.history.push({ role: 'user', content: fullMessage });
            let turns = 0;
            const config = vscode.workspace.getConfiguration('vibey');
            const MAX_TURNS = config.get('maxTurns') || 64;
            while (turns < MAX_TURNS) {
                if (signal.aborted)
                    throw new Error('Request cancelled by user');
                turns++;
                // 2. Call LLM
                if (onUpdate)
                    onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}/${MAX_TURNS}: Reasoning...` });
                const responseText = await this.llm.chat(this.context.history, signal);
                if (signal.aborted)
                    throw new Error('Request cancelled by user');
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
                    // Emit thought if present
                    if (parsed.thought && onUpdate) {
                        onUpdate({ type: 'thought', message: parsed.thought });
                    }
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
                        if (signal.aborted)
                            throw new Error('Request cancelled by user');
                        try {
                            if (onUpdate)
                                onUpdate({ type: 'tool_start', tool: call.name, parameters: call.parameters });
                            const result = await this.tools.executeTool(call);
                            if (onUpdate)
                                onUpdate({ type: 'tool_end', tool: call.name, success: true, result: result });
                            this.context.history.push({
                                role: 'tool',
                                content: JSON.stringify(result)
                            });
                        }
                        catch (error) {
                            if (onUpdate)
                                onUpdate({ type: 'tool_end', tool: call.name, success: false, error: error.message });
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
            this.abortController = null;
            // Limit reached: Self-Reflection Turn
            if (onUpdate)
                onUpdate({ type: 'thinking', message: 'Max turns reached. Summarizing progress...' });
            this.context.history.push({
                role: 'user',
                content: "You have reached the maximum number of turns. Please provide a concise summary of what you have accomplished so far, what issues you encountered, and what steps should be taken next to complete the task."
            });
            const summary = await this.llm.chat(this.context.history, signal);
            this.context.history.push({ role: 'assistant', content: summary });
            return `**Max Turns Reached (${MAX_TURNS})**\n\n${summary}`;
        }
        catch (error) {
            this.abortController = null;
            if (error.message === 'Request cancelled by user') {
                return 'Request cancelled.';
            }
            throw error;
        }
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=orchestrator.js.map