
import * as vscode from 'vscode';
import { LLMProvider, ChatMessage } from '../agent/types';
import { ToolCall } from '../tools/schema';

interface OllamaResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
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

        try {
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal // Pass signal to fetch
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }

            const data = await response.json() as OllamaResponse;

            return data.message.content;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('Request cancelled by user');
            }
            console.error('Failed to call Ollama:', error);
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
