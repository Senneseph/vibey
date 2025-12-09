"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
const vscode = __importStar(require("vscode"));
const extension_1 = require("../extension");
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
    async chat(messages, signal) {
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
            const data = await response.json();
            // Track token usage
            const metricsCollector = (0, extension_1.getMetricsCollector)();
            if (metricsCollector && data.prompt_eval_count !== undefined) {
                metricsCollector.record('tokens_sent', data.prompt_eval_count);
            }
            if (metricsCollector && data.eval_count !== undefined) {
                metricsCollector.record('tokens_received', data.eval_count);
            }
            return data.message.content;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request cancelled by user');
            }
            console.error('Failed to call Ollama:', error);
            throw error;
        }
    }
    async listModels() {
        const { baseUrl } = this.getConfig();
        try {
            const response = await fetch(`${baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.statusText}`);
            }
            const data = await response.json();
            return data.models.map(m => m.name);
        }
        catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }
}
exports.OllamaClient = OllamaClient;
//# sourceMappingURL=ollama.js.map