import * as vscode from 'vscode';
import { AgentContext, LLMProvider, ChatMessage } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';
import { ContextManager, ContextItem } from './context_manager';
import { ConversationManager } from './conversation_manager';
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
    private conversationManager: ConversationManager;

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

    /**
     * Reset the agent's context and memory
     */
    public resetContext() {
        // Clear the context history, keeping only the system prompt
        this.conversationManager.clearHistory();
        
        // Clear the context manager's master context AND all checkpoints
        this.contextManager.clearMasterContext();
        this.contextManager.clearAllCheckpointContext();
        
        console.log('[VIBEY][Orchestrator] Context reset completed - all context cleared');
    }

    constructor(
        private llm: LLMProvider,
        private tools: ToolGateway,
        workspaceRoot: string
    ) {
        this.contextManager = new ContextManager();
        this.tokenManager = getTokenManager();
        this.conversationManager = new ConversationManager(this.getSystemPrompt());
        this.context = {
            workspaceRoot,
            history: this.conversationManager.getHistory()
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

            this.conversationManager.addUserMessage(fullMessage);
            this.context.history = this.conversationManager.getHistory();
            console.log(`[VIBEY][Orchestrator] Total history size: ${JSON.stringify(this.context.history).length} bytes`);
            
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Strategic planning with full context window...' });
            let finalResponse = '';
            let lastResponseText = ''; // Track the last response for debugging
            let iterationCount = 0;
            const maxIterations = 20; // Prevent infinite loops

            while (iterationCount < maxIterations) {
                iterationCount++;
                console.log(`[VIBEY][Orchestrator] Loop iteration ${iterationCount}/${maxIterations}`);
                if (signal.aborted) throw new Error('Request cancelled by user');
                if (onUpdate) onUpdate({ type: 'thinking', message: 'Analyzing request...' });
                
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
               
               let responseText;
               try {
                   // Use the conversation manager to get the history for the LLM
                   const historyForLLM = this.conversationManager.getHistoryForLLM();

                   // DEBUG: Show what we're sending to the LLM in the UI
                   if (onUpdate) {
                       const debugInfo = `**[DEBUG] LLM Call #${iterationCount}**

Sending ${historyForLLM.length} messages to LLM:
${historyForLLM.slice(-3).map((m, i) => `${i + 1}. **${m.role}**: ${typeof m.content === 'string' ? m.content.substring(0, 150) : JSON.stringify(m.content).substring(0, 150)}...`).join('\n')}`;

                       onUpdate({
                           type: 'info',
                           message: debugInfo
                       });
                   }

                   console.log(`[VIBEY][Orchestrator] ========== LLM CALL #${iterationCount} ==========`);
                   console.log(`[VIBEY][Orchestrator] Sending ${historyForLLM.length} messages to LLM`);
                   historyForLLM.forEach((msg, idx) => {
                       const preview = typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200);
                       console.log(`[VIBEY][Orchestrator]   [${idx}] ${msg.role}: ${preview}...`);
                   });

                   responseText = await callLLM(this.llm, historyForLLM, signal);
                   lastResponseText = responseText; // Store for debugging

                   // DEBUG: Show what we got back from the LLM in the UI
                   if (onUpdate) {
                       const responsePreview = responseText.substring(0, 500);
                       onUpdate({
                           type: 'info',
                           message: `**[DEBUG] LLM Response #${iterationCount}**\n\n\`\`\`\n${responsePreview}${responseText.length > 500 ? '\n...(truncated)' : ''}\n\`\`\``
                       });
                   }

                   console.log(`[VIBEY][Orchestrator] ========== LLM RESPONSE #${iterationCount} ==========`);
                   console.log(`[VIBEY][Orchestrator] Response length: ${responseText.length} chars`);
                   console.log(`[VIBEY][Orchestrator] Response: ${responseText.substring(0, 500)}...`);
               } catch (error: any) {
                   // Log the full API message in the chat window for debugging
                   console.error(`[VIBEY][Orchestrator] LLM API Error:`, error);

                   // Create detailed error report for UI
                   const errorReport = `**LLM API Error**

${error.message}

**Error Details:**
- Error Type: ${error.name || 'Unknown'}
- Message Count: ${this.context.history.length}
- Estimated Tokens: ${tokenUsage.total}

**Stack Trace:**
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\`

**Last Message Sent:**
\`\`\`
${JSON.stringify(this.context.history[this.context.history.length - 1], null, 2).substring(0, 500)}
\`\`\`

**Token Usage:**
\`\`\`json
${JSON.stringify(tokenUsage, null, 2)}
\`\`\``;

                   if (onUpdate) {
                       onUpdate({
                           type: 'error',
                           message: errorReport
                       });
                   }
                   throw error;
               }
                
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

                console.log(`[VIBEY][Orchestrator] ========== PARSING RESPONSE #${iterationCount} ==========`);

                const parsed = parseLLMResponse(responseText, onUpdate);
                console.log(`[VIBEY][Orchestrator] Parsed result:`, JSON.stringify(parsed, null, 2));
                console.log(`[VIBEY][Orchestrator] Type checks:`);
                console.log(`[VIBEY][Orchestrator]   - parsed is null/undefined: ${!parsed}`);
                console.log(`[VIBEY][Orchestrator]   - has 'text' property: ${!!parsed?.text}`);
                console.log(`[VIBEY][Orchestrator]   - has 'thought' property: ${!!parsed?.thought}`);
                console.log(`[VIBEY][Orchestrator]   - has 'tool_calls' property: ${!!parsed?.tool_calls}`);
                console.log(`[VIBEY][Orchestrator]   - tool_calls is array: ${Array.isArray(parsed?.tool_calls)}`);

                // DEBUG: Show parsing decision in UI
                if (onUpdate) {
                    const decision = !parsed || parsed.text ? 'PLAIN TEXT' :
                                   parsed.tool_calls && Array.isArray(parsed.tool_calls) ? `TOOL CALLS (${parsed.tool_calls.length})` :
                                   'FINAL RESPONSE';
                    onUpdate({
                        type: 'info',
                        message: `**[DEBUG] Parse Decision #${iterationCount}**: ${decision}\n\nParsed: \`${JSON.stringify(parsed, null, 2).substring(0, 300)}\``
                    });
                }

                if (!parsed || parsed.text) {
                    console.log(`[VIBEY][Orchestrator] ✅ DECISION: Treating as plain text response - BREAKING LOOP`);
                    if (onUpdate) {
                        onUpdate({ type: 'info', message: `**[DEBUG]** Setting final response and exiting loop` });
                    }
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = responseText;
                    break;
                }
                if (parsed.thought && onUpdate) {
                    console.log(`[VIBEY][Orchestrator] Sending thought update: ${parsed.thought}`);
                    onUpdate({ type: 'thought', message: parsed.thought });
                }
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    console.log(`[VIBEY][Orchestrator] ✅ DECISION: Processing ${parsed.tool_calls.length} tool calls - WILL CONTINUE LOOP`);
                   this.conversationManager.addAssistantMessage(responseText);
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
                   // After processing all tool calls, ensure role alternation
                   this.conversationManager.ensureRoleAlternation();
                   this.context.history = this.conversationManager.getHistory();
                   console.log(`[VIBEY][Orchestrator] Tool calls processed, continuing loop to get next LLM response`);
                   console.log(`[VIBEY][Orchestrator] Current history length: ${this.context.history.length}`);
                   console.log(`[VIBEY][Orchestrator] Last 3 messages:`, this.context.history.slice(-3).map(m => ({ role: m.role, contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) : 'object' })));

                   // Send update to UI showing we're continuing
                   if (onUpdate) {
                       onUpdate({
                           type: 'info',
                           message: `Tool execution complete. Continuing to process response... (iteration ${iterationCount}/${maxIterations})`
                       });
                   }
                   // Continue the loop to get the next response from the LLM
               } else {
                   // No tool calls - this is a final response
                   console.log(`[VIBEY][Orchestrator] ✅ DECISION: No tool calls found - treating as final response - BREAKING LOOP`);
                   console.log(`[VIBEY][Orchestrator] Setting finalResponse to: ${parsed.thought ? 'parsed.thought' : 'responseText'}`);

                   if (onUpdate) {
                       onUpdate({
                           type: 'info',
                           message: `**[DEBUG]** No tool calls in response. Setting final response and exiting loop.\n\nFinal response preview: ${(parsed.thought || responseText).substring(0, 200)}...`
                       });
                   }

                   this.conversationManager.addAssistantMessage(responseText);
                   finalResponse = parsed.thought || responseText;
                   console.log(`[VIBEY][Orchestrator] finalResponse set to: ${finalResponse.substring(0, 200)}...`);
                   break;
               }
            }

            // Check if we hit max iterations
            if (iterationCount >= maxIterations && !finalResponse) {
                const errorReport = `**ERROR: Maximum iterations reached**

The agent reached the maximum number of iterations (${maxIterations}) without completing the task.

**Last LLM Response:**
\`\`\`
${lastResponseText.substring(0, 1000)}
\`\`\`

**Conversation History (${this.context.history.length} messages):**
${this.context.history.slice(-5).map((msg, idx) => `${idx + 1}. ${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`).join('\n')}

This suggests the agent is stuck in a loop. Please try rephrasing your request or breaking it into smaller tasks.`;

                if (onUpdate) {
                    onUpdate({
                        type: 'error',
                        message: errorReport
                    });
                }

                return errorReport;
            }
            this.abortController = null;

            console.log(`[VIBEY][Orchestrator] Main loop completed. finalResponse is: ${finalResponse ? 'SET' : 'NOT SET'}`);
            if (finalResponse) {
                console.log(`[VIBEY][Orchestrator] finalResponse length: ${finalResponse.length} chars`);
                console.log(`[VIBEY][Orchestrator] finalResponse preview: ${finalResponse.substring(0, 200)}...`);

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
            // If we get here, it means the loop was broken by a return statement
            // This should not happen under normal circumstances, but we'll handle it gracefully
            console.error('[VIBEY][Orchestrator] ❌ CRITICAL: Unexpected exit from main loop - no final response generated');
            console.error('[VIBEY][Orchestrator] This indicates the LLM response was not properly handled');

            // Get the last few messages for context
            const recentHistory = this.context.history.slice(-3).map((msg, idx) => {
                const content = typeof msg.content === 'string'
                    ? msg.content.substring(0, 300)
                    : JSON.stringify(msg.content).substring(0, 300);
                return `Message ${idx + 1} (${msg.role}):\n${content}${content.length >= 300 ? '...' : ''}`;
            }).join('\n\n');

            // Report detailed error in the UI
            const errorReport = `**CRITICAL ERROR: No response generated**

The LLM response loop completed but no final response was set. This is a bug in the response handling logic.

**Debug Information:**
- Main loop completed without setting finalResponse
- This typically means the LLM returned a response that wasn't properly parsed or handled

**Last known state:**
- History messages: ${this.context.history.length}
- Last message role: ${this.context.history[this.context.history.length - 1]?.role || 'unknown'}

**Last LLM Response (first 1000 chars):**
\`\`\`
${lastResponseText.substring(0, 1000)}${lastResponseText.length > 1000 ? '\n...(truncated)' : ''}
\`\`\`

**Recent Conversation History:**
\`\`\`
${recentHistory}
\`\`\`

This is a bug - the response should have been handled. Please report this with the above details.`;

            if (onUpdate) {
                onUpdate({
                    type: 'error',
                    message: errorReport
                });
            }

            return errorReport;
        } catch (error: any) {
            this.abortController = null;
            const errorMsg = formatError(error);
            if (onUpdate) onUpdate({ type: 'error', message: errorMsg });
            return `**Error:** ${errorMsg}`;
        }
    }
}
