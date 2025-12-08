"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
const vscode = require("vscode");
class OllamaClient {
    constructor() { }
    getConfig() {
        // Safe access to vscode API
        // If running in pure node (tests), we might need fallback, but strictly this is VS Code extension code.
        const config = vscode.workspace.getConfiguration('vibey');
        return {
            modelName: config.get('model') || 'Qwen3-coder-roo-config:latest',
            baseUrl: config.get('ollamaUrl') || 'http://localhost:11434'
        };
    }
    async chat(messages) {
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
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.statusText}`);
            }
            const data = await response.json();
            return data.message.content;
        }
        catch (error) {
            console.error('Failed to call Ollama:', error);
            throw error;
        }
    }
}
exports.OllamaClient = OllamaClient;
//# sourceMappingURL=ollama.js.map