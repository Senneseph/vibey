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
        /**
         * Controller for managing request cancellation
         */
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
        return `You are Vibey, an expert autonomous coding agent.
You are running inside VS Code.

## Core Behavior

BE AUTONOMOUS. When given a task:
1. Gather information using tools
2. Plan your approach
3. EXECUTE the plan immediately - do NOT ask for permission
4. Continue working until the task is COMPLETE
5. Only stop when you have fully solved the problem

NEVER respond with "Would you like me to..." or "Should I...?" - just DO IT.
NEVER stop after gathering information - immediately proceed to implementation.
NEVER ask for confirmation before making changes - the user asked you to do something, so do it.

## Available Tools

${toolDefs}

## Response Format

When using tools, output ONLY a JSON block:
\`\`\`json
{
  "thought": "Brief reasoning about what I'm doing and why...",
  "tool_calls": [
    {
      "id": "unique_id",
      "name": "tool_name",
      "parameters": { ... }
    }
  ]
}
\`\`\`

When you are DONE with the entire task and have nothing more to do, respond with plain text summarizing what you accomplished.

## Important Rules

- Use tools to READ before you WRITE - understand the code first
- Make targeted, minimal changes - don't rewrite entire files
- If a tool fails, try a different approach
- Keep working until the task is fully complete
- For multi-step tasks, execute ALL steps in sequence without stopping
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
                // Check for JSON block - handle both \n and \r\n line endings
                // First try fenced code block (preferred), then try to find a JSON object
                const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
                let parsed;
                let jsonContent = null;
                if (fencedMatch) {
                    // Found fenced JSON block - extract and clean the content
                    jsonContent = fencedMatch[1].trim();
                    // Sometimes LLMs duplicate the "json" word inside the block - strip it
                    if (jsonContent.startsWith('json')) {
                        jsonContent = jsonContent.slice(4).trim();
                    }
                }
                else {
                    // Try to find a JSON object that looks like a tool call
                    // Look for {"thought": or {"tool_calls": pattern
                    const toolCallPattern = /(\{\s*"(?:thought|tool_calls)"[\s\S]*?\})\s*$/;
                    const jsonMatch = responseText.match(toolCallPattern);
                    if (jsonMatch) {
                        jsonContent = jsonMatch[1];
                    }
                }
                if (!jsonContent) {
                    // No tool call, just a text response.
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return responseText;
                }
                // Try to parse the JSON
                try {
                    parsed = JSON.parse(jsonContent);
                }
                catch (e) {
                    // JSON parsing failed - this could be truncated or malformed
                    console.error('[Orchestrator] Failed to parse JSON:', e, 'Content:', jsonContent.substring(0, 200));
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return responseText;
                }
                // Validate that we have a proper tool call structure
                if (!parsed || typeof parsed !== 'object') {
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return responseText;
                }
                // Emit thought if present
                if (parsed.thought && onUpdate) {
                    onUpdate({ type: 'thought', message: parsed.thought });
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
                                onUpdate({
                                    type: 'tool_start',
                                    id: call.id,
                                    tool: call.name,
                                    parameters: call.parameters
                                });
                            const result = await this.tools.executeTool(call);
                            if (onUpdate)
                                onUpdate({
                                    type: 'tool_end',
                                    id: call.id,
                                    tool: call.name,
                                    success: true,
                                    result: result
                                });
                            this.context.history.push({
                                role: 'tool',
                                content: JSON.stringify(result)
                            });
                        }
                        catch (error) {
                            if (onUpdate)
                                onUpdate({
                                    type: 'tool_end',
                                    id: call.id,
                                    tool: call.name,
                                    success: false,
                                    error: error.message
                                });
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