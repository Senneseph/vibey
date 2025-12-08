"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
class OllamaClient {
    constructor(modelName = 'Qwen3-coder-roo-config:latest', // Default per user env
    baseUrl = 'http://localhost:11434') {
        this.modelName = modelName;
        this.baseUrl = baseUrl;
    }
    async chat(messages) {
        // Convert internal ChatMessage format to Ollama format
        // Note: Ollama expects "tool" role messages to be handled carefully or just as "user"/"system" depending on model.
        // For Qwen3-coder, it likely supports standard roles.
        const payload = {
            model: this.modelName,
            messages: messages.map(m => {
                if (m.role === 'tool') {
                    // Convert tool output to a user message for now if model doesn't support 'tool' role explicitly
                    // or keep as tool if using a newer model version that supports it.
                    // Qwen2.5/3 often expects tool outputs in a specific way.
                    // For simplicity in this scaffold, we'll map 'tool' to 'user' with a prefix, 
                    // OR assume the model handles 'tool' role. Let's try native 'tool'.
                    return { role: 'tool', content: JSON.stringify(m.content) };
                }
                return {
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                };
            }),
            stream: false // Non-streaming for MVP simplicity
        };
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
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