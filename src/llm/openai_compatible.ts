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

    async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
        const { provider, modelName, baseUrl, apiKey } = this.getConfig();
        const startTime = Date.now();

        // Normalize the endpoint URL to ensure it has /v1
        const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const chatEndpoint = `${normalizedBaseUrl}/chat/completions`;

        const payload = {
            model: modelName,
            messages: messages.map(m => {
                if (m.role === 'tool') {
                    // Normalize tool role for models that support it
                    return { role: 'tool', content: JSON.stringify(m.content) };
                }
                return {
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                };
            }),
            stream: false
        };

        // Log request details
        const payloadString = JSON.stringify(payload);
        const totalTokens = payloadString.length / 4;
        console.log(`[VIBEY][OpenAI-Compatible] Sending request to ${chatEndpoint}`);
        console.log(`[VIBEY][OpenAI-Compatible] Provider: ${provider}`);
        console.log(`[VIBEY][OpenAI-Compatible] Model: ${modelName}`);
        console.log(`[VIBEY][OpenAI-Compatible] Messages: ${payload.messages.length}`);
        console.log(`[VIBEY][OpenAI-Compatible] Estimated payload tokens: ~${Math.ceil(totalTokens)}`);
        console.log(`[VIBEY][OpenAI-Compatible] Payload size: ${payloadString.length} bytes`);
        
        // Log actual message content (truncated if too long)
        payload.messages.forEach((msg, idx) => {
            const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const preview = contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr;
            console.log(`[VIBEY][OpenAI-Compatible] Message ${idx} (${msg.role}): "${preview}"`);
        });

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
            const data = await response.json() as OpenAIResponse;
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

            return data.choices[0].message.content;

        } catch (error: any) {
            const totalElapsed = Date.now() - startTime;
            console.error(`[VIBEY][OpenAI-Compatible] ❌ Error after ${totalElapsed}ms:`, error.message);
            
            if (error.name === 'AbortError') {
                console.error(`[VIBEY][OpenAI-Compatible] Request was cancelled by user`);
                throw new Error('Request cancelled by user');
            }
            
            // Detailed error diagnostics
            if (error instanceof TypeError) {
                console.error(`[VIBEY][OpenAI-Compatible] ❌ NETWORK ERROR - Cannot connect to endpoint`);
                console.error(`[VIBEY][OpenAI-Compatible] This typically means:`);
                console.error(`[VIBEY][OpenAI-Compatible]   1. Server is NOT running (Check: ${baseUrl})`);
                console.error(`[VIBEY][OpenAI-Compatible]   2. URL is wrong (Check: vibey.openaiBaseUrl setting = ${baseUrl})`);
                console.error(`[VIBEY][OpenAI-Compatible]   3. Network connectivity issue (Check firewall/VPN)`);
                console.error(`[VIBEY][OpenAI-Compatible]   4. Wrong port or path (Should be /v1)`);
                console.error(`[VIBEY][OpenAI-Compatible]   5. API key required but not provided`);
            } else if (error.message.includes('JSON')) {
                console.error(`[VIBEY][OpenAI-Compatible] ❌ RESPONSE PARSING ERROR`);
                console.error(`[VIBEY][OpenAI-Compatible] Server sent invalid JSON response`);
                console.error(`[VIBEY][OpenAI-Compatible] Possible causes:`);
                console.error(`[VIBEY][OpenAI-Compatible]   1. Model is crashing/unloading`);
                console.error(`[VIBEY][OpenAI-Compatible]   2. Server error`);
            } else if (error.message.includes('status')) {
                console.error(`[VIBEY][OpenAI-Compatible] ❌ HTTP ERROR FROM SERVER`);
                console.error(`[VIBEY][OpenAI-Compatible] Server returned an error code`);
                console.error(`[VIBEY][OpenAI-Compatible] Check server logs for details`);
            }
            
            console.error(`[VIBEY][OpenAI-Compatible] Full error:`, error);
            console.error(`[VIBEY][OpenAI-Compatible] Error name: ${error.name}`);
            console.error(`[VIBEY][OpenAI-Compatible] Error message: ${error.message}`);
            console.error(`[VIBEY][OpenAI-Compatible] Stack:`, error.stack);
            throw error;
        }
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