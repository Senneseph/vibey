
import * as vscode from 'vscode';
import { LLMProvider, ChatMessage } from '../agent/types';
import { ToolCall } from '../tools/schema';
import { getMetricsCollector } from '../extension';

interface OllamaResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    prompt_eval_count?: number;  // Number of tokens in the prompt
    eval_count?: number;          // Number of tokens in the response
}

export class OllamaClient implements LLMProvider {
    constructor() { }

    private getConfig() {
        // Safe access to vscode API
        // If running in pure node (tests), we might need fallback, but strictly this is VS Code extension code.
        const config = vscode.workspace.getConfiguration('vibey');
        return {
            modelName: config.get<string>('model') || 'Qwen3-coder:latest',
            baseUrl: config.get<string>('ollamaUrl') || 'http://localhost:11434'
        };
    }

    private async checkOllamaHealth(baseUrl: string): Promise<{ok: boolean, info?: string}> {
        try {
            console.log(`[VIBEY][Ollama] Testing connection to ${baseUrl}/api/tags...`);
            const healthStart = Date.now();
            const response = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
            const healthDuration = Date.now() - healthStart;
            
            if (response.ok) {
                console.log(`[VIBEY][Ollama] ✅ Ollama server is healthy (${healthDuration}ms response time)`);
                return { ok: true };
            } else {
                console.warn(`[VIBEY][Ollama] ⚠️  Ollama health check returned status ${response.status}`);
                return { ok: false, info: `Status ${response.status}` };
            }
        } catch (error: any) {
            console.error(`[VIBEY][Ollama] ❌ Cannot reach Ollama server at ${baseUrl}`);
            console.error(`[VIBEY][Ollama] Error details: ${error.message}`);
            return { ok: false, info: error.message };
        }
    }


    async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<{
        content: string;
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    }> {
        const { modelName, baseUrl } = this.getConfig();
        const startTime = Date.now();

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
        console.log(`[VIBEY][Ollama] Sending request to ${baseUrl}/api/chat`);
        console.log(`[VIBEY][Ollama] Model: ${modelName}`);
        console.log(`[VIBEY][Ollama] Messages: ${payload.messages.length}`);
        console.log(`[VIBEY][Ollama] Estimated payload tokens: ~${Math.ceil(totalTokens)}`);
        console.log(`[VIBEY][Ollama] Payload size: ${payloadString.length} bytes`);
        
        // Log actual message content (truncated if too long)
        payload.messages.forEach((msg, idx) => {
            const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
            const preview = contentStr.length > 200 ? contentStr.substring(0, 200) + '...' : contentStr;
            console.log(`[VIBEY][Ollama] Message ${idx} (${msg.role}): "${preview}"`);
        });

        try {
            // Check Ollama health before sending request
            const healthCheck = await this.checkOllamaHealth(baseUrl);
            if (!healthCheck.ok) {
                console.warn(`[VIBEY][Ollama] ⚠️  WARNING: Ollama may not be available (${healthCheck.info})`);
                console.warn(`[VIBEY][Ollama] Continuing anyway - will timeout if unreachable`);
            }
            
            console.log(`[VIBEY][Ollama] Initiating fetch request at ${new Date().toISOString()}...`);
            console.log(`[VIBEY][Ollama] Sending ${payloadString.length} bytes to ${baseUrl}/api/chat`);
            const fetchStartTime = Date.now();
            
            // Create a timeout promise to monitor if request hangs
            let lastLog = 0;
            const timeoutMonitor = setInterval(() => {
                const elapsed = Date.now() - fetchStartTime;
                if (elapsed - lastLog >= 5000) {  // Log every 5 seconds
                    console.log(`[VIBEY][Ollama] ⏳ Request still pending after ${elapsed}ms - Ollama may be processing or server may be hung`);
                    console.log(`[VIBEY][Ollama]    - Connection is open but waiting for response`);
                    console.log(`[VIBEY][Ollama]    - Check: Is Ollama process still running? (ps aux | grep ollama)`);
                    console.log(`[VIBEY][Ollama]    - Check: Is the model loaded? (ollama list)`);
                    console.log(`[VIBEY][Ollama]    - Check: Monitor Ollama logs for errors`);
                    lastLog = elapsed;
                }
            }, 1000);
            
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payloadString,
                signal // Pass signal to fetch
            });
            
            clearInterval(timeoutMonitor);

            const fetchElapsed = Date.now() - fetchStartTime;
            const totalElapsed = Date.now() - startTime;
            console.log(`[VIBEY][Ollama] ✅ Fetch completed in ${fetchElapsed}ms (total elapsed: ${totalElapsed}ms) with status ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Could not read error response');
                console.error(`[VIBEY][Ollama] API returned error: ${response.statusText}`);
                console.error(`[VIBEY][Ollama] Status: ${response.status}`);
                console.error(`[VIBEY][Ollama] Response: ${errorText.substring(0, 200)}`);
                throw new Error(`Ollama API error: ${response.statusText} (status ${response.status})`);
            }

            console.log(`[VIBEY][Ollama] Parsing JSON response...`);
            const parseStartTime = Date.now();
            const data = await response.json() as OllamaResponse;
            const parseElapsed = Date.now() - parseStartTime;

            const responseElapsed = Date.now() - fetchStartTime;
            const totalElapsedFinal = Date.now() - startTime;
            console.log(`[VIBEY][Ollama] Response parsed in ${parseElapsed}ms (total fetch: ${responseElapsed}ms, total: ${totalElapsedFinal}ms)`);
            console.log(`[VIBEY][Ollama] Response tokens - prompt: ${data.prompt_eval_count}, generated: ${data.eval_count}`);

            // Track token usage
            const metricsCollector = getMetricsCollector();
            if (metricsCollector && data.prompt_eval_count !== undefined) {
                metricsCollector.record('tokens_sent', data.prompt_eval_count);
            }
            if (metricsCollector && data.eval_count !== undefined) {
                metricsCollector.record('tokens_received', data.eval_count);
            }
 
            // Return both the response content and token usage data
            return {
                content: data.message.content,
                usage: {
                    prompt_tokens: data.prompt_eval_count || 0,
                    completion_tokens: data.eval_count || 0,
                    total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
                }
            };

        } catch (error: any) {
            const totalElapsed = Date.now() - startTime;
            console.error(`[VIBEY][Ollama] ❌ Error after ${totalElapsed}ms:`, error.message);
            
            if (error.name === 'AbortError') {
                console.error(`[VIBEY][Ollama] Request was cancelled by user`);
                throw new Error('Request cancelled by user');
            }
            
            // Detailed network error diagnostics
            if (error instanceof TypeError) {
                console.error(`[VIBEY][Ollama] ❌ NETWORK ERROR - Cannot connect to Ollama`);
                console.error(`[VIBEY][Ollama] This typically means:`);
                console.error(`[VIBEY][Ollama]   1. Ollama server is NOT running (Start it: ollama serve)`);
                console.error(`[VIBEY][Ollama]   2. URL is wrong (Check: vibey.ollamaUrl setting = ${baseUrl})`);
                console.error(`[VIBEY][Ollama]   3. Network connectivity issue (Check firewall/VPN)`);
                console.error(`[VIBEY][Ollama]   4. Wrong port (Default is 11434)`);
                console.error(`[VIBEY][Ollama]   5. CORS issue if Ollama is on different machine`);
            } else if (error.message.includes('JSON')) {
                console.error(`[VIBEY][Ollama] ❌ RESPONSE PARSING ERROR`);
                console.error(`[VIBEY][Ollama] Ollama sent invalid JSON response`);
                console.error(`[VIBEY][Ollama] Possible causes:`);
                console.error(`[VIBEY][Ollama]   1. Model is crashing/unloading`);
                console.error(`[VIBEY][Ollama]   2. Out of memory (check 'ollama list')`);
                console.error(`[VIBEY][Ollama]   3. Ollama version mismatch`);
            } else if (error.message.includes('status')) {
                console.error(`[VIBEY][Ollama] ❌ HTTP ERROR FROM OLLAMA`);
                console.error(`[VIBEY][Ollama] Server returned an error code`);
                console.error(`[VIBEY][Ollama] Check Ollama logs for details`);
            }
            
            console.error(`[VIBEY][Ollama] Full error:`, error);
            console.error(`[VIBEY][Ollama] Error name: ${error.name}`);
            console.error(`[VIBEY][Ollama] Error message: ${error.message}`);
            console.error(`[VIBEY][Ollama] Stack:`, error.stack);
            throw error;
        }
    }

    async listModels(): Promise<string[]> {
        const { baseUrl } = this.getConfig();
        try {
            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }
            const data = await response.json() as { models: { name: string }[] };
            return data.models.map(m => m.name);
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }
}
