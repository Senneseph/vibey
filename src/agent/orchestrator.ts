import * as vscode from 'vscode';
import { AgentContext, LLMProvider, ChatMessage } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';
import { ContextManager, ContextItem } from './context_manager';
import { getContextForTask, resolveContext } from './context_utils';
import { callLLM, parseLLMResponse } from './llm_utils';
import { executeTool, handleToolResult } from './tool_utils';
import { pushHistory, getHistory } from './history_utils';
import { formatError, handleAbort } from './error_utils';
import { getMetricsCollector } from '../extension';
import { getTokenManager, TokenManager, TokenUsage } from './token_manager';

export class AgentOrchestrator {
    private context: AgentContext;
    private tokenManager: TokenManager;

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
        this.tokenManager = getTokenManager();
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
        const rules = config.get<Record<string, string>>('rules', {});
        const userGuidelines = config.get<string>('userGuidelines', '');
        
        console.log(`[VIBEY][Orchestrator] Loading system prompt...`);
        console.log(`[VIBEY][Orchestrator] User guidelines present: ${userGuidelines ? 'YES' : 'NO'}`);
        if (userGuidelines) {
            console.log(`[VIBEY][Orchestrator] User guidelines content: ${userGuidelines.substring(0, 200)}${userGuidelines.length > 200 ? '...' : ''}`);
        }
        console.log(`[VIBEY][Orchestrator] Rules present: ${Object.keys(rules).length > 0 ? 'YES' : 'NO'}`);
        
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
            console.log(`[VIBEY][Orchestrator] Starting chat with message length: ${userMessage.length} chars`);
            console.log(`[VIBEY][Orchestrator] Context items: ${contextItems?.length || 0}`);
            
            const contextBlockStart = Date.now();
            let contextBlock = contextItems && contextItems.length > 0
                ? await getContextForTask(this.contextManager, userMessage, contextItems)
                : '';
            const contextBlockTime = Date.now() - contextBlockStart;
            
            console.log(`[VIBEY][Orchestrator] Context resolution took ${contextBlockTime}ms`);
            console.log(`[VIBEY][Orchestrator] Context block size: ${contextBlock.length} characters (~${Math.ceil(contextBlock.length / 4)} tokens)`);
            
            // Calculate token usage BEFORE adding to history
            const systemPromptTokens = this.tokenManager.estimateTokens(this.context.history[0].content);
            const userMessageTokens = this.tokenManager.estimateTokens(userMessage);
            const contextTokens = this.tokenManager.estimateTokens(contextBlock);
            
            const tokenUsage: TokenUsage = {
                systemPrompt: systemPromptTokens,
                context: contextTokens,
                userMessage: userMessageTokens,
                toolResults: 0,
                total: systemPromptTokens + contextTokens + userMessageTokens
            };

            console.log(`[VIBEY][Orchestrator] Token usage:`, tokenUsage);
            console.log(`[VIBEY][Orchestrator] ${this.tokenManager.formatTokenReport(tokenUsage)}`);

            // Track per-message token usage
            const messageTokens = userMessageTokens + contextTokens;
            const perMessageReport = this.tokenManager.formatPerMessageTokenReport(messageTokens, tokenUsage.total);
            console.log(`[VIBEY][Orchestrator] ${perMessageReport}`);

            // Send per-message token usage to UI
            if (onUpdate) {
                onUpdate({
                    type: 'perMessageTokens',
                    messageTokens: messageTokens,
                    currentTotal: tokenUsage.total,
                    percentage: this.tokenManager.getUsagePercentage(tokenUsage.total),
                    remaining: this.tokenManager.getRemainingTokens(tokenUsage.total),
                    meter: this.tokenManager.createContextUsageMeter(tokenUsage.total)
                });
            }
            
            // Check if we're exceeding token limits
            if (this.tokenManager.isExceeded(tokenUsage.total)) {
                console.warn(`[VIBEY][Orchestrator] ⚠️ WARNING: Total tokens (${tokenUsage.total}) exceeds limit (${this.tokenManager.getConfig().maxTokens})`);
                 
                // Truncate context to fit within limits
                const truncated = this.tokenManager.truncateContext(
                    contextBlock,
                    systemPromptTokens,
                    userMessageTokens
                );
                 
                if (truncated.wasExceeded) {
                    console.warn(`[VIBEY][Orchestrator] Context truncated - removed ${truncated.removedTokens} tokens`);
                    if (onUpdate) {
                        onUpdate({
                            type: 'warning',
                            message: `Context was too large (${tokenUsage.context} tokens). Truncated to fit within ${this.tokenManager.getConfig().maxTokens} token limit.`
                        });
                    }
                }
            } else if (this.tokenManager.isApproachingLimit(tokenUsage.total)) {
                console.warn(`[VIBEY][Orchestrator] ⚠️ Approaching token limit: ${tokenUsage.total}/${this.tokenManager.getConfig().maxTokens} tokens`);
                
                // Implement context condensation when approaching limit
                const condensationThreshold = this.tokenManager.getConfig().maxTokens * 0.9; // 90% of limit
                if (tokenUsage.total > condensationThreshold) {
                    console.log(`[VIBEY][Orchestrator] 🔄 Initiating context condensation...`);
                    
                    // Create a summary of the current context for condensation
                    const summaryPrompt = `Please create a concise but meaningful summary of the work done so far. Focus on:
1. Key accomplishments
2. Current state of the task
3. Important findings or decisions
4. Next steps needed

Current context summary: ${contextBlock.substring(0, 2000)}...`;
                    
                    // Add this as a system message to get a summary
                    const condensationMessages: ChatMessage[] = [
                        { role: 'system', content: 'You are a helpful assistant that creates concise summaries.' },
                        { role: 'user', content: summaryPrompt }
                    ];
                    
                    try {
                        const summaryResponse = await callLLM(this.llm, condensationMessages, signal);
                        
                        // Replace the current context with the summary
                        const condensedContext = `## Context Summary (Condensed)

${summaryResponse}

---

[Previous detailed context condensed to save tokens]`;
                        
                        console.log(`[VIBEY][Orchestrator] 📝 Context condensed from ${contextBlock.length} to ${condensedContext.length} characters`);
                        
                        if (onUpdate) {
                            onUpdate({
                                type: 'contextCondensed',
                                originalSize: contextBlock.length,
                                condensedSize: condensedContext.length,
                                message: `Context condensed to save tokens. Summary created to preserve key information.`
                            });
                        }
                        
                        // Use the condensed context instead
                        contextBlock = condensedContext;
                        
                    } catch (error) {
                        console.error(`[VIBEY][Orchestrator] ❌ Context condensation failed:`, error);
                        if (onUpdate) {
                            onUpdate({
                                type: 'warning',
                                message: `Context condensation attempted but failed. Continuing with original context.`
                            });
                        }
                    }
                } else {
                    if (onUpdate) {
                        onUpdate({
                            type: 'warning',
                            message: `Approaching token limit (${this.tokenManager.getUsagePercentage(tokenUsage.total)}% used). Consider breaking into multiple turns.`
                        });
                    }
                }
            } else {
                console.log(`[VIBEY][Orchestrator] ✅ Token usage is healthy (${this.tokenManager.getUsagePercentage(tokenUsage.total)}% of limit)`);
            }
            
            // Report context summary to UI
            if (contextItems && contextItems.length > 0 && onUpdate) {
                onUpdate({
                    type: 'contextAdded',
                    files: contextItems.map(c => ({ name: c.name, path: c.path })),
                    tokenEstimate: contextTokens,
                    characterCount: contextBlock.length
                });
            }
            
            const fullMessage = userMessage + contextBlock;
            console.log(`[VIBEY][Orchestrator] Full message size: ${fullMessage.length} chars (~${Math.ceil(fullMessage.length / 4)} tokens)`);
            console.log(`[VIBEY][Orchestrator] System prompt size: ${this.context.history[0].content.length} chars (~${Math.ceil(this.context.history[0].content.length / 4)} tokens)`);
            
            pushHistory(this.context.history, { role: 'user', content: fullMessage });
            console.log(`[VIBEY][Orchestrator] Total history size: ${JSON.stringify(this.context.history).length} bytes`);
            
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Strategic planning with full context window...' });
            const MAX_TURNS = 256;
            let turns = 0;
            let finalResponse = '';
            while (turns < MAX_TURNS) {
                if (signal.aborted) throw new Error('Request cancelled by user');
                turns++;
                if (onUpdate) onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}: Reasoning...` });
                
                // Log LLM request details before sending
                const historySize = JSON.stringify(this.context.history).length;
                const messageCount = this.context.history.length;
                const estimatedTokens = Math.ceil(historySize / 4);
                const requestStartTime = Date.now();
                
                console.log(`[VIBEY][Orchestrator] Sending LLM request - Messages: ${messageCount}, Size: ${historySize} bytes, Est. tokens: ${estimatedTokens}`);
                console.log(`[VIBEY][Orchestrator] Waiting for Ollama response...`);
                
                // Log each message in history
                this.context.history.forEach((msg, idx) => {
                    const contentPreview = typeof msg.content === 'string' 
                        ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
                        : JSON.stringify(msg.content).substring(0, 100) + '...';
                    console.log(`[VIBEY][Orchestrator] History[${idx}] (${msg.role}): ${contentPreview}`);
                });
                
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
                
                const responseText = await callLLM(this.llm, this.context.history, signal);
                
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
