import * as vscode from 'vscode';
import { LLMProvider, ChatMessage } from '../agent/types';
import { ToolCall } from '../tools/schema';
import { getMetricsCollector } from '../extension';

interface OpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>; 
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export class OpenAICompatibleClient implements LLMProvider {
    constructor() { }

    private getConfig() {
        const config = vscode.workspace.getConfiguration('vibey');
        return {
            provider: config.get<string>('provider') || 'ollama',
            modelName: config.get<string>('model') || 'Qwen3-coder:latest',
            baseUrl: config.get<string>('openaiBaseUrl') || 'http://localhost:11434/v1',
            apiKey: config.get<string>('openaiApiKey') || ''
        };
    }

    private async checkEndpointHealth(baseUrl: string): Promise<{ok: boolean, info?: string}> {
        try {
            console.log(`[VIBEY][OpenAI-Compatible] Testing connection to ${baseUrl}/models...`);
            const healthStart = Date.now();
            const response = await fetch(`${baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.getConfig().apiKey ? {'Authorization': `Bearer ${this.getConfig().apiKey}`} : {})
                }
            });
            const healthDuration = Date.now() - healthStart;
            
            if (response.ok) {
                console.log(`[VIBEY][OpenAI-Compatible] ✅ Endpoint is healthy (${healthDuration}ms response time)`);
                return { ok: true };
            } else {
                console.warn(`[VIBEY][OpenAI-Compatible] ⚠️  Health check returned status ${response.status}`);
                return { ok: false, info: `Status ${response.status}` };
            }
        } catch (error: any) {
            console.error(`[VIBEY][OpenAI-Compatible] ❌ Cannot reach endpoint at ${baseUrl}`);
            console.error(`[VIBEY][OpenAI-Compatible] Error details: ${error.message}`);
            return { ok: false, info: error.message };
        }
    }

    /**
     * Formats messages for llama.cpp compatibility
     * llama.cpp expects strict alternation between user and assistant roles after system message
     * Tool messages need to be converted to user/assistant format
     */
    private formatMessagesForLlamaCpp(messages: ChatMessage[]): ChatMessage[] {
        const formattedMessages: ChatMessage[] = [];
        
        // Always start with system message if present
        const systemMessage = messages.find(m => m.role === 'system');
        if (systemMessage) {
            formattedMessages.push(systemMessage);
        }
        
        // Process remaining messages, handling tool calls specially
        let lastRole: 'user' | 'assistant' | null = null;
        
        for (const message of messages) {
            if (message.role === 'system') continue; // Already handled
            
            if (message.role === 'tool') {
                // Convert tool messages to user/assistant format for llama.cpp
                // Tool results are always treated as user messages (as if user provided the result)
                try {
                    const toolData = typeof message.content === 'string'
                        ? JSON.parse(message.content)
                        : message.content;
                    
                    // Tool result - treat as user message with minimal formatting
                    formattedMessages.push({
                        role: 'user',
                        content: `[Tool Result]: ${JSON.stringify(toolData)}`
                    });
                    lastRole = 'user';
                } catch (error) {
                    console.error(`[VIBEY][OpenAI-Compatible] ❌ Error parsing tool message:`, error);
                    // If we can't parse, just add as user message with raw content
                    formattedMessages.push({
                        role: 'user',
                        content: `[Tool Message]: ${message.content}`
                    });
                    lastRole = 'user';
                }
            } else {
                // Regular user or assistant message
                // Ensure proper alternation
                if (lastRole === message.role) {
                    // If we have consecutive same roles, this is a problem
                    // For llama.cpp, we need to ensure alternation
                    console.warn(`[VIBEY][OpenAI-Compatible] ⚠️  Detected consecutive ${message.role} messages - this may cause issues with llama.cpp`);
                    
                    // Try to fix the alternation by inserting a dummy message
                    if (message.role === 'user') {
                        formattedMessages.push({
                            role: 'assistant',
                            content: '[...]'
                        });
                        lastRole = 'assistant';
                    } else {
                        formattedMessages.push({
                            role: 'user',
                            content: '[...]'
                        });
                        lastRole = 'user';
                    }
                }
                
                formattedMessages.push(message);
                lastRole = message.role;
            }
        }
        
        return formattedMessages;
    }

    async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<{
        content: string;
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    }> {
        const { provider, modelName, baseUrl, apiKey } = this.getConfig();
        const startTime = Date.now();

        // Normalize the endpoint URL to ensure it has /v1
        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const chatEndpoint = `${normalizedBaseUrl}/chat/completions`;

        // Format messages for llama.cpp compatibility
        const formattedMessages = this.formatMessagesForLlamaCpp(messages);

        const payload = {
            model: modelName,
            messages: formattedMessages.map(m => {
                return {
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                };
            }),
            stream: false
        };

        // Log request details
        const payloadString = JSON.stringify(payload);
        
        // More accurate token estimation - count actual content tokens, not JSON overhead
        let totalTokens = 0;
        for (const msg of payload.messages) {
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            // More accurate estimation: 1 token ≈ 3.5 characters for English text
            totalTokens += Math.ceil(content.length / 3.5);
        }
        
        console.log(`[VIBEY][OpenAI-Compatible] Sending request to ${chatEndpoint}`);
        console.log(`[VIBEY][OpenAI-Compatible] Provider: ${provider}`);
        console.log(`[VIBEY][OpenAI-Compatible] Model: ${modelName}`);
        console.log(`[VIBEY][OpenAI-Compatible] Original messages: ${messages.length}, Formatted messages: ${payload.messages.length}`);
        console.log(`[VIBEY][OpenAI-Compatible] Estimated content tokens: ~${Math.ceil(totalTokens)}`);
        console.log(`[VIBEY][OpenAI-Compatible] Payload size: ${payloadString.length} bytes`);
        
        // Log message roles for debugging
        const roles = formattedMessages.map(m => m.role);
        console.log(`[VIBEY][OpenAI-Compatible] Message roles: ${roles.join(' -> ')}`);
        
        // Log actual message content (truncated if too long)
        payload.messages.forEach((msg, idx) => {
            const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const preview = contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr;
            console.log(`[VIBEY][OpenAI-Compatible] Message ${idx} (${msg.role}): "${preview}"`);
        });

        // Retry configuration
        const maxRetries = 2; // Total attempts: 1 initial + 2 retries = 3 total
        let retryCount = 0;
        let lastError: Error | null = null;
        
        // Retry loop
        while (retryCount <= maxRetries) {
            const attemptStartTime = Date.now();
            console.log(`[VIBEY][OpenAI-Compatible] Attempt ${retryCount + 1}/${maxRetries + 1}...`);
            
            try {
                // Check endpoint health before sending request
                const healthCheck = await this.checkEndpointHealth(normalizedBaseUrl);
                if (!healthCheck.ok) {
                    console.warn(`[VIBEY][OpenAI-Compatible] ⚠️  WARNING: Endpoint may not be available (${healthCheck.info})`);
                    console.warn(`[VIBEY][OpenAI-Compatible] Continuing anyway - will timeout if unreachable`);
                }
                
                console.log(`[VIBEY][OpenAI-Compatible] Initiating fetch request at ${new Date().toISOString()}...`);
                console.log(`[VIBEY][OpenAI-Compatible] Sending ${payloadString.length} bytes to ${chatEndpoint}`);
                const fetchStartTime = Date.now();
                
                // Create a timeout monitor
                let lastLog = 0;
                const timeoutMonitor = setInterval(() => {
                    const elapsed = Date.now() - fetchStartTime;
                    if (elapsed - lastLog >= 5000) {  // Log every 5 seconds
                        console.log(`[VIBEY][OpenAI-Compatible] ⏳ Request still pending after ${elapsed}ms - Server may be processing`);
                        lastLog = elapsed;
                    }
                }, 1000);
                
                const response = await fetch(chatEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey ? {'Authorization': `Bearer ${apiKey}`} : {})
                    },
                    body: payloadString,
                    signal // Pass signal to fetch
                });
                
                clearInterval(timeoutMonitor);

                const fetchElapsed = Date.now() - fetchStartTime;
                const totalElapsed = Date.now() - startTime;
                console.log(`[VIBEY][OpenAI-Compatible] ✅ Fetch completed in ${fetchElapsed}ms (total elapsed: ${totalElapsed}ms) with status ${response.status}`);

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Could not read error response');
                    console.error(`[VIBEY][OpenAI-Compatible] API returned error: ${response.statusText}`);
                    console.error(`[VIBEY][OpenAI-Compatible] Status: ${response.status}`);
                    console.error(`[VIBEY][OpenAI-Compatible] Response: ${errorText.substring(0, 200)}`);
                    throw new Error(`OpenAI-Compatible API error: ${response.statusText} (status ${response.status})`);
                }

                console.log(`[VIBEY][OpenAI-Compatible] Parsing JSON response...`);
                const parseStartTime = Date.now();
                
                // Check if response body is empty
                const responseText = await response.text();
                if (!responseText || responseText.trim() === '') {
                    console.error(`[VIBEY][OpenAI-Compatible] ❌ Empty response received from server`);
                    console.error(`[VIBEY][OpenAI-Compatible] This may indicate server glitch - will retry`);
                    
                    // Retry the request once
                    if (retryCount < maxRetries) {
                        console.log(`[VIBEY][OpenAI-Compatible] Retrying request (attempt ${retryCount + 1}/${maxRetries})...`);
                        retryCount++;
                        continue; // Skip to next iteration to retry
                    } else {
                        console.error(`[VIBEY][OpenAI-Compatible] ❌ Max retries reached - giving up`);
                        throw new Error('Empty response received from LLM after maximum retries');
                    }
                }
                
                let data: OpenAIResponse;
                try {
                    data = JSON.parse(responseText) as OpenAIResponse;
                } catch (parseError) {
                    console.error(`[VIBEY][OpenAI-Compatible] ❌ Failed to parse JSON response:`, parseError);
                    console.error(`[VIBEY][OpenAI-Compatible] Response text:`, responseText.substring(0, 500));
                    
                    // Retry the request once for parse errors too
                    if (retryCount < maxRetries) {
                        console.log(`[VIBEY][OpenAI-Compatible] Retrying request due to parse error (attempt ${retryCount + 1}/${maxRetries})...`);
                        retryCount++;
                        continue; // Skip to next iteration to retry
                    } else {
                        console.error(`[VIBEY][OpenAI-Compatible] ❌ Max retries reached for parse error - giving up`);
                        throw new Error(`Failed to parse LLM response after maximum retries: ${(parseError as Error).message}`);
                    }
                }
                
                const parseElapsed = Date.now() - parseStartTime;

                const responseElapsed = Date.now() - fetchStartTime;
                const totalElapsedFinal = Date.now() - startTime;
                console.log(`[VIBEY][OpenAI-Compatible] Response parsed in ${parseElapsed}ms (total fetch: ${responseElapsed}ms, total: ${totalElapsedFinal}ms)`);
                
                // Track token usage
               const metricsCollector = getMetricsCollector();
               if (metricsCollector && data.usage) {
                   metricsCollector.record('tokens_sent', data.usage.prompt_tokens);
                   metricsCollector.record('tokens_received', data.usage.completion_tokens);
               }

               // Return both the response content and token usage data
               return {
                   content: data.choices[0].message.content,
                   usage: data.usage
               };

            } catch (error: any) {
                lastError = error;
                retryCount++;
                
                if (retryCount <= maxRetries) {
                    console.log(`[VIBEY][OpenAI-Compatible] Retry ${retryCount}/${maxRetries} due to error: ${error.message}`);
                    // Add small delay before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        // If we get here, all retries failed
        const totalElapsed = Date.now() - startTime;
        console.error(`[VIBEY][OpenAI-Compatible] ❌ All ${maxRetries + 1} attempts failed after ${totalElapsed}ms`);
        throw lastError || new Error('All retry attempts failed');
    }

    async listModels(): Promise<string[]> {
        const { baseUrl, apiKey } = this.getConfig();
        
        // Normalize the endpoint URL to ensure it has /v1
        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const modelsEndpoint = `${normalizedBaseUrl}/models`;
        
        try {
            const response = await fetch(modelsEndpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? {'Authorization': `Bearer ${apiKey}`} : {})
                }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }
            
            const data = await response.json() as {
                data: Array<{
                    id: string;
                    object: string;
                    created: number;
                }>
            };
            
            return data.data.map(m => m.id);
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }
}