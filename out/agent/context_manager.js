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
exports.ContextManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
class ContextManager {
    constructor() {
        this.projectStructure = null;
        this.masterContext = new Map(); // Master context storage
        this.contextWindowTokens = 256 * 1024; // 256k token window
    }
    async resolveContext(items) {
        if (!items || items.length === 0)
            return '';
        let contextBlock = '\n\n<context>\n';
        // First, try to build a project structure if we have a workspace root
        if (items.length > 0 && items[0].path) {
            const firstPath = items[0].path;
            const workspaceRoot = path.dirname(firstPath);
            await this.buildProjectStructure(workspaceRoot);
        }
        for (const item of items) {
            try {
                // Determine if file is text or binary (basic check)
                // For MVP, assume everything is text/code.
                const content = await fs.readFile(item.path, 'utf-8');
                // If content is too long, truncate it to manageable size
                const maxLines = 256;
                const lines = content.split('\n');
                if (lines.length > maxLines) {
                    const truncatedContent = lines.slice(0, maxLines).join('\n') + '\n... (content truncated)';
                    contextBlock += `<file path="${item.path}" truncated="true">\n${truncatedContent}\n</file>\n`;
                }
                else {
                    contextBlock += `<file path="${item.path}">\n${content}\n</file>\n`;
                }
            }
            catch (e) {
                console.error(`Failed to read context file ${item.path}`, e);
                contextBlock += `<file path="${item.path}" error="true">Could not read file.</file>\n`;
            }
        }
        contextBlock += '</context>\n';
        return contextBlock;
    }
    async buildProjectStructure(workspaceRoot) {
        try {
            this.projectStructure = await this.buildStructureFromPath(workspaceRoot);
        }
        catch (e) {
            console.error('Failed to build project structure', e);
        }
    }
    async buildStructureFromPath(dirPath) {
        const structure = {
            root: dirPath,
            files: [],
            directories: {}
        };
        const items = await fs.readdir(dirPath);
        for (const item of items) {
            const itemPath = path.join(dirPath, item);
            const stat = await fs.stat(itemPath);
            if (stat.isDirectory()) {
                structure.directories[item] = await this.buildStructureFromPath(itemPath);
            }
            else if (stat.isFile()) {
                structure.files.push(itemPath);
            }
        }
        return structure;
    }
    // Method to get project structure for hierarchical context
    getProjectStructure() {
        return this.projectStructure;
    }
    // Method to get relevant context based on project hierarchy
    async getHierarchicalContext(contextItems, maxContextSize = 4096) {
        // This method would implement a shifting window approach based on project structure
        // For now, we'll just return the regular context but this is where we'd implement
        // the hierarchical shifting window logic
        return this.resolveContext(contextItems);
    }
    // NEW: Master context management for sliding window implementation
    // Add content to the master context
    addToMasterContext(key, content) {
        this.masterContext.set(key, content);
    }
    // Get content from master context
    getFromMasterContext(key) {
        return this.masterContext.get(key);
    }
    // Remove content from master context
    removeFromMasterContext(key) {
        this.masterContext.delete(key);
    }
    // Get all master context items
    getAllMasterContext() {
        return new Map(this.masterContext);
    }
    // Clear master context
    clearMasterContext() {
        this.masterContext.clear();
    }
    // Generate sliding window context from master context
    generateSlidingWindowContext() {
        // Prioritize recent, critical, and task-relevant content
        // Truncate or summarize less relevant content to fit within 256k tokens
        const MAX_TOKENS = 256 * 1024;
        let context = '';
        let totalTokens = 0;
        // Sort keys: prioritize 'task_description', then 'context_' (files), then others
        const sortedKeys = Array.from(this.masterContext.keys()).sort((a, b) => {
            if (a === 'task_description')
                return -1;
            if (b === 'task_description')
                return 1;
            if (a.startsWith('context_') && !b.startsWith('context_'))
                return -1;
            if (!a.startsWith('context_') && b.startsWith('context_'))
                return 1;
            return 0;
        });
        for (const key of sortedKeys) {
            let content = this.masterContext.get(key) || '';
            let tokens = this.estimateTokenCount(content);
            // If adding this content would exceed the window, truncate or summarize
            if (totalTokens + tokens > MAX_TOKENS) {
                // Truncate to fit remaining tokens
                const remainingTokens = MAX_TOKENS - totalTokens;
                if (remainingTokens > 0) {
                    const approxChars = remainingTokens * 4;
                    content = content.slice(0, approxChars) + '\n... (content truncated)';
                    tokens = this.estimateTokenCount(content);
                    context += `\n<master_context key="${key}" truncated="true">\n${content}\n</master_context>\n`;
                    totalTokens += tokens;
                }
                break; // Window full
            }
            else {
                context += `\n<master_context key="${key}">\n${content}\n</master_context>\n`;
                totalTokens += tokens;
            }
        }
        // If context is still too large, add a summary note
        if (totalTokens > MAX_TOKENS) {
            context += '\n<!-- Context window exceeded, some content omitted -->\n';
        }
        return context;
    }
    // Method to estimate token count for context
    estimateTokenCount(content) {
        // Simple estimation: 1 token ~ 4 characters
        return Math.ceil(content.length / 4);
    }
    // Method to get context with sliding window logic
    async getContextForTask(taskDescription, contextItems) {
        // Add task description to master context
        this.addToMasterContext('task_description', taskDescription);
        // Add context items to master context
        for (const item of contextItems) {
            try {
                const content = await fs.readFile(item.path, 'utf-8');
                this.addToMasterContext(`context_${item.path}`, content);
            }
            catch (e) {
                console.error(`Failed to read context file ${item.path}`, e);
                this.addToMasterContext(`context_${item.path}`, `Could not read file: ${item.path}`);
            }
        }
        // Generate sliding window context
        return this.generateSlidingWindowContext();
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=context_manager.js.map