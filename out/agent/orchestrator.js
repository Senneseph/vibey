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
const context_utils_1 = require("./context_utils");
const llm_utils_1 = require("./llm_utils");
const tool_utils_1 = require("./tool_utils");
const history_utils_1 = require("./history_utils");
const error_utils_1 = require("./error_utils");
const extension_1 = require("../extension");
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
        // Get configuration settings
        const config = vscode.workspace.getConfiguration('vibey');
        const rules = config.get('rules', {});
        const userGuidelines = config.get('userGuidelines', '');
        // Format rules for inclusion in system prompt
        let rulesContent = '';
        if (Object.keys(rules).length > 0) {
            rulesContent = `## Rules\n\n${JSON.stringify(rules, null, 2)}\n\n`;
        }
        // Format user guidelines for inclusion in system prompt
        let guidelinesContent = '';
        if (userGuidelines) {
            guidelinesContent = `## User Guidelines\n\n${userGuidelines}\n\n`;
        }
        const toolDefs = this.tools.getToolDefinitions().map((t) => {
            return `## ${t.name}\n${t.description}\nParameters: ${JSON.stringify(t.parameters)}`;
        }).join('\n\n');
        return `You are Vibey, an expert autonomous coding agent in VS Code.

## Core Behavior

BE AUTONOMOUS:
1. Gather information using tools
2. Plan your approach  
3. EXECUTE the plan immediately - do NOT ask for permission
4. Continue until the task is COMPLETE
5. Only stop when fully solved

NEVER ask "Would you like me to...?" or "Should I...?" - just DO IT.
NEVER stop after gathering info - immediately implement.
NEVER ask for confirmation before making changes.

${rulesContent}${guidelinesContent}## Available Tools

${toolDefs}

## Response Format

Output ONLY JSON when using tools:
\`\`\`json
{
  "thought": "Brief reasoning...",
  "tool_calls": [
    {"id": "id", "name": "tool_name", "parameters": { ... }}
  ]
}
\`\`\`

When done, respond with plain text summarizing what you accomplished.

## Key Rules

- READ before WRITE - understand code first
- Make targeted, minimal changes
- Keep working until fully complete
- For multi-step tasks, execute ALL steps
`;
    }
    async chat(userMessage, contextItems, onUpdate) {
        (0, error_utils_1.handleAbort)(this.abortController);
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        try {
            // Context block
            console.log(`[VIBEY][Orchestrator] Starting chat with message length: ${userMessage.length} chars`);
            console.log(`[VIBEY][Orchestrator] Context items: ${contextItems?.length || 0}`);
            const contextBlockStart = Date.now();
            const contextBlock = contextItems && contextItems.length > 0
                ? await (0, context_utils_1.getContextForTask)(this.contextManager, userMessage, contextItems)
                : '';
            const contextBlockTime = Date.now() - contextBlockStart;
            console.log(`[VIBEY][Orchestrator] Context resolution took ${contextBlockTime}ms`);
            console.log(`[VIBEY][Orchestrator] Context block size: ${contextBlock.length} characters (~${Math.ceil(contextBlock.length / 4)} tokens)`);
            // Report context summary to UI
            if (contextItems && contextItems.length > 0 && onUpdate) {
                const contextSize = contextBlock.length;
                const contextTokens = Math.ceil(contextSize / 4); // Rough estimate: 4 chars per token
                onUpdate({
                    type: 'contextAdded',
                    files: contextItems.map(c => ({ name: c.name, path: c.path })),
                    tokenEstimate: contextTokens,
                    characterCount: contextSize
                });
            }
            const fullMessage = userMessage + contextBlock;
            console.log(`[VIBEY][Orchestrator] Full message size: ${fullMessage.length} chars (~${Math.ceil(fullMessage.length / 4)} tokens)`);
            console.log(`[VIBEY][Orchestrator] System prompt size: ${this.context.history[0].content.length} chars (~${Math.ceil(this.context.history[0].content.length / 4)} tokens)`);
            (0, history_utils_1.pushHistory)(this.context.history, { role: 'user', content: fullMessage });
            console.log(`[VIBEY][Orchestrator] Total history size: ${JSON.stringify(this.context.history).length} bytes`);
            if (onUpdate)
                onUpdate({ type: 'thinking', message: 'Strategic planning with full context window...' });
            const MAX_TURNS = 256;
            let turns = 0;
            let finalResponse = '';
            while (turns < MAX_TURNS) {
                if (signal.aborted)
                    throw new Error('Request cancelled by user');
                turns++;
                if (onUpdate)
                    onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}: Reasoning...` });
                // Log LLM request details before sending
                const historySize = JSON.stringify(this.context.history).length;
                const messageCount = this.context.history.length;
                const estimatedTokens = Math.ceil(historySize / 4);
                const requestStartTime = Date.now();
                console.log(`[VIBEY][Orchestrator] Sending LLM request - Messages: ${messageCount}, Size: ${historySize} bytes, Est. tokens: ${estimatedTokens}`);
                console.log(`[VIBEY][Orchestrator] Waiting for Ollama response...`);
                // Send request details to UI
                if (onUpdate) {
                    onUpdate({
                        type: 'llmRequest',
                        payload: {
                            model: 'ollama',
                            messages: this.context.history,
                            messageCount: messageCount
                        },
                        estimatedTokens: estimatedTokens,
                        duration: 0
                    });
                }
                const responseText = await (0, llm_utils_1.callLLM)(this.llm, this.context.history, signal);
                // Calculate actual fetch duration and send update
                const fetchDuration = Date.now() - requestStartTime;
                console.log(`[VIBEY][Orchestrator] LLM response received in ${fetchDuration}ms`);
                if (onUpdate) {
                    onUpdate({
                        type: 'llmRequest',
                        payload: {
                            model: 'ollama',
                            messages: this.context.history,
                            messageCount: messageCount
                        },
                        estimatedTokens: estimatedTokens,
                        duration: fetchDuration
                    });
                }
                if (signal.aborted)
                    throw new Error('Request cancelled by user');
                const parsed = (0, llm_utils_1.parseLLMResponse)(responseText);
                if (!parsed || parsed.text) {
                    (0, history_utils_1.pushHistory)(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = responseText;
                    break;
                }
                if (parsed.thought && onUpdate) {
                    onUpdate({ type: 'thought', message: parsed.thought });
                }
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    (0, history_utils_1.pushHistory)(this.context.history, { role: 'assistant', content: responseText });
                    for (const call of parsed.tool_calls) {
                        if (signal.aborted)
                            throw new Error('Request cancelled by user');
                        try {
                            if (onUpdate)
                                onUpdate({ type: 'tool_start', id: call.id, tool: call.name, parameters: call.parameters });
                            const result = await (0, tool_utils_1.executeTool)(this.tools, call);
                            if (onUpdate)
                                onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: true, result });
                            (0, tool_utils_1.handleToolResult)(this.context.history, result, call);
                            // If the tool result contains new context, add it to master context
                            if (result && typeof result === 'object' && result.content) {
                                // Add to master context for future reference
                                if (call.name === 'read_file') {
                                    const filePath = call.parameters.path;
                                    const key = `context_${filePath}`;
                                    this.contextManager.addContextItem(key, result.content);
                                }
                            }
                        }
                        catch (error) {
                            if (onUpdate)
                                onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: false, error: error.message });
                            (0, tool_utils_1.handleToolResult)(this.context.history, { status: 'error', error: error.message }, call);
                        }
                    }
                }
                else {
                    (0, history_utils_1.pushHistory)(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = parsed.thought || responseText;
                    break;
                }
            }
            this.abortController = null;
            if (finalResponse) {
                // Add token summary if available
                const metricsCollector = (0, extension_1.getMetricsCollector)();
                if (metricsCollector) {
                    // Get token summary for this conversation
                    const tokensSent = metricsCollector.getSummary('tokens_sent')?.currentValue || 0;
                    const tokensReceived = metricsCollector.getSummary('tokens_received')?.currentValue || 0;
                    if (onUpdate) {
                        onUpdate({
                            type: 'tokens',
                            sent: tokensSent,
                            received: tokensReceived
                        });
                    }
                }
                return finalResponse;
            }
            if (onUpdate)
                onUpdate({ type: 'thinking', message: 'Max turns reached. Summarizing progress...' });
            (0, history_utils_1.pushHistory)(this.context.history, {
                role: 'user',
                content: "You have reached the maximum number of turns. Please provide a concise summary of what you have accomplished so far, what issues you encountered, and what steps should be taken next to complete the task."
            });
            const summary = await (0, llm_utils_1.callLLM)(this.llm, this.context.history, signal);
            (0, history_utils_1.pushHistory)(this.context.history, { role: 'assistant', content: summary });
            // Add token summary if available
            const metricsCollector = (0, extension_1.getMetricsCollector)();
            if (metricsCollector) {
                const tokensSent = metricsCollector.getSummary('tokens_sent')?.currentValue || 0;
                const tokensReceived = metricsCollector.getSummary('tokens_received')?.currentValue || 0;
                if (onUpdate) {
                    onUpdate({
                        type: 'tokens',
                        sent: tokensSent,
                        received: tokensReceived
                    });
                }
            }
            return `**Max Turns Reached (${MAX_TURNS})**\n\n${summary}`;
        }
        catch (error) {
            this.abortController = null;
            const errorMsg = (0, error_utils_1.formatError)(error);
            if (onUpdate)
                onUpdate({ type: 'error', message: errorMsg });
            return `**Error:** ${errorMsg}`;
        }
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=orchestrator.js.map