
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
            modelName: config.get<string>('model') || 'Qwen3-coder-roo-config:latest',
            baseUrl: config.get<string>('ollamaUrl') || 'http://localhost:11434'
        };
    }


    async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
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
        const totalTokens = JSON.stringify(payload).length / 4;
        console.log(`[VIBEY][Ollama] Sending request to ${baseUrl}/api/chat`);
        console.log(`[VIBEY][Ollama] Model: ${modelName}`);
        console.log(`[VIBEY][Ollama] Messages: ${payload.messages.length}`);
        console.log(`[VIBEY][Ollama] Estimated payload tokens: ~${Math.ceil(totalTokens)}`);
        console.log(`[VIBEY][Ollama] Payload size: ${JSON.stringify(payload).length} bytes`);

        try {
            console.log(`[VIBEY][Ollama] Initiating fetch request...`);
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal // Pass signal to fetch
            });

            const elapsed = Date.now() - startTime;
            console.log(`[VIBEY][Ollama] Fetch completed in ${elapsed}ms with status ${response.status}`);

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText} (status ${response.status})`);
            }

            const data = await response.json() as OllamaResponse;

            const totalElapsed = Date.now() - startTime;
            console.log(`[VIBEY][Ollama] Response received. Total time: ${totalElapsed}ms`);
            console.log(`[VIBEY][Ollama] Response tokens - prompt: ${data.prompt_eval_count}, generated: ${data.eval_count}`);

            // Track token usage
            const metricsCollector = getMetricsCollector();
            if (metricsCollector && data.prompt_eval_count !== undefined) {
                metricsCollector.record('tokens_sent', data.prompt_eval_count);
            }
            if (metricsCollector && data.eval_count !== undefined) {
                metricsCollector.record('tokens_received', data.eval_count);
            }

            return data.message.content;

        } catch (error: any) {
            const totalElapsed = Date.now() - startTime;
            console.error(`[VIBEY][Ollama] Error after ${totalElapsed}ms:`, error.message);
            
            if (error.name === 'AbortError') {
                throw new Error('Request cancelled by user');
            }
            console.error(`[VIBEY][Ollama] Full error:`, error);
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
