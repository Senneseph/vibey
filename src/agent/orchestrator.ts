import * as vscode from 'vscode';
import { AgentContext, LLMProvider } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';
import { ContextManager, ContextItem } from './context_manager';
import { getContextForTask, resolveContext } from './context_utils';
import { callLLM, parseLLMResponse } from './llm_utils';
import { executeTool, handleToolResult } from './tool_utils';
import { pushHistory, getHistory } from './history_utils';
import { formatError, handleAbort } from './error_utils';
import { getMetricsCollector } from '../extension';

export class AgentOrchestrator {
    private context: AgentContext;

    private contextManager: ContextManager;
    /**
     * Controller for managing request cancellation
     */
    private abortController: AbortController | null = null;

    public cancel() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    constructor(
        private llm: LLMProvider,
        private tools: ToolGateway,
        workspaceRoot: string
    ) {
        this.contextManager = new ContextManager();
        this.context = {
            workspaceRoot,
            history: [
                { role: 'system', content: this.getSystemPrompt() }
            ]
        };
    }

    private getSystemPrompt(): string {
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
        
        const toolDefs = this.tools.getToolDefinitions().map((t: ToolDefinition) => {
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

    async chat(userMessage: string, contextItems?: ContextItem[], onUpdate?: (update: any) => void): Promise<string> {
        handleAbort(this.abortController);
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        try {
            // Context block
            const contextBlock = contextItems && contextItems.length > 0
                ? await getContextForTask(this.contextManager, userMessage, contextItems)
                : '';
            
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
            
            pushHistory(this.context.history, { role: 'user', content: userMessage + contextBlock });
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Strategic planning with full context window...' });
            const MAX_TURNS = 256;
            let turns = 0;
            let finalResponse = '';
            while (turns < MAX_TURNS) {
                if (signal.aborted) throw new Error('Request cancelled by user');
                turns++;
                if (onUpdate) onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}: Reasoning...` });
                const responseText = await callLLM(this.llm, this.context.history, signal);
                if (signal.aborted) throw new Error('Request cancelled by user');
                const parsed = parseLLMResponse(responseText);
                if (!parsed || parsed.text) {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = responseText;
                    break;
                }
                if (parsed.thought && onUpdate) {
                    onUpdate({ type: 'thought', message: parsed.thought });
                }
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    for (const call of parsed.tool_calls) {
                        if (signal.aborted) throw new Error('Request cancelled by user');
                        try {
                            if (onUpdate) onUpdate({ type: 'tool_start', id: call.id, tool: call.name, parameters: call.parameters });
                            const result = await executeTool(this.tools, call);
                            if (onUpdate) onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: true, result });
                            handleToolResult(this.context.history, result, call);
                            
                            // If the tool result contains new context, add it to master context
                            if (result && typeof result === 'object' && result.content) {
                                // Add to master context for future reference
                                if (call.name === 'read_file') {
                                    const filePath = call.parameters.path;
                                    const key = `context_${filePath}`;
                                    this.contextManager.addContextItem(key, result.content);
                                }
                            }
                        } catch (error: any) {
                            if (onUpdate) onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: false, error: error.message });
                            handleToolResult(this.context.history, { status: 'error', error: error.message }, call);
                        }
                    }
                } else {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = parsed.thought || responseText;
                    break;
                }
            }
            this.abortController = null;
            if (finalResponse) {
                // Add token summary if available
                const metricsCollector = getMetricsCollector();
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
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Max turns reached. Summarizing progress...' });
            pushHistory(this.context.history, {
                role: 'user',
                content: "You have reached the maximum number of turns. Please provide a concise summary of what you have accomplished so far, what issues you encountered, and what steps should be taken next to complete the task."
            });
            const summary = await callLLM(this.llm, this.context.history, signal);
            pushHistory(this.context.history, { role: 'assistant', content: summary });
            
            // Add token summary if available
            const metricsCollector = getMetricsCollector();
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
        } catch (error: any) {
            this.abortController = null;
            const errorMsg = formatError(error);
            if (onUpdate) onUpdate({ type: 'error', message: errorMsg });
            return `**Error:** ${errorMsg}`;
        }
    }
}
