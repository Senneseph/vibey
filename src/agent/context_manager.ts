import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ContextItem {
    name: string;
    path: string;
}

export interface ProjectStructure {
    root: string;
    files: string[];
    directories: { [key: string]: ProjectStructure };
}

export class ContextManager {
    private projectStructure: ProjectStructure | null = null;
    private masterContext: Map<string, string> = new Map(); // Master context storage
    private contextWindowTokens: number = 256 * 1024; // 256k token window
    
    async resolveContext(items: ContextItem[]): Promise<string> {
        if (!items || items.length === 0) return '';

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
                } else {
                    contextBlock += `<file path="${item.path}">\n${content}\n</file>\n`;
                }
            } catch (e) {
                console.error(`Failed to read context file ${item.path}`, e);
                contextBlock += `<file path="${item.path}" error="true">Could not read file.</file>\n`;
            }
        }

        contextBlock += '</context>\n';
        return contextBlock;
    }
    
    private async buildProjectStructure(workspaceRoot: string): Promise<void> {
        try {
            this.projectStructure = await this.buildStructureFromPath(workspaceRoot);
        } catch (e) {
            console.error('Failed to build project structure', e);
        }
    }
    
    private async buildStructureFromPath(dirPath: string): Promise<ProjectStructure> {
        const structure: ProjectStructure = {
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
            } else if (stat.isFile()) {
                structure.files.push(itemPath);
            }
        }
        
        return structure;
    }
    
    // Method to get project structure for hierarchical context
    getProjectStructure(): ProjectStructure | null {
        return this.projectStructure;
    }
    
    // Method to get relevant context based on project hierarchy
    async getHierarchicalContext(contextItems: ContextItem[], maxContextSize: number = 4096): Promise<string> {
        // This method would implement a shifting window approach based on project structure
        // For now, we'll just return the regular context but this is where we'd implement
        // the hierarchical shifting window logic
        return this.resolveContext(contextItems);
    }
    
    // NEW: Master context management for sliding window implementation
    
    // Add content to the master context
    addToMasterContext(key: string, content: string): void {
        this.masterContext.set(key, content);
    }
    
    // Get content from master context
    getFromMasterContext(key: string): string | undefined {
        return this.masterContext.get(key);
    }
    
    // Remove content from master context
    removeFromMasterContext(key: string): void {
        this.masterContext.delete(key);
    }
    
    // Get all master context items
    getAllMasterContext(): Map<string, string> {
        return new Map(this.masterContext);
    }
    
    // Clear master context
    clearMasterContext(): void {
        this.masterContext.clear();
    }
    
    // Generate sliding window context from master context
    generateSlidingWindowContext(): string {
        // Prioritize recent, critical, and task-relevant content
        // Truncate or summarize less relevant content to fit within 256k tokens
        const MAX_TOKENS = 256 * 1024;
        let context = '';
        let totalTokens = 0;

        // Sort keys: prioritize 'task_description', then 'context_' (files), then others
        const sortedKeys = Array.from(this.masterContext.keys()).sort((a, b) => {
            if (a === 'task_description') return -1;
            if (b === 'task_description') return 1;
            if (a.startsWith('context_') && !b.startsWith('context_')) return -1;
            if (!a.startsWith('context_') && b.startsWith('context_')) return 1;
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
            } else {
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
    estimateTokenCount(content: string): number {
        // Simple estimation: 1 token ~ 4 characters
        return Math.ceil(content.length / 4);
    }
    
    // Method to get context with sliding window logic
    async getContextForTask(taskDescription: string, contextItems: ContextItem[]): Promise<string> {
        // Add task description to master context
        this.addToMasterContext('task_description', taskDescription);
        
        // Add context items to master context
        for (const item of contextItems) {
            try {
                const content = await fs.readFile(item.path, 'utf-8');
                this.addToMasterContext(`context_${item.path}`, content);
            } catch (e) {
                console.error(`Failed to read context file ${item.path}`, e);
                this.addToMasterContext(`context_${item.path}`, `Could not read file: ${item.path}`);
            }
        }
        
        // Generate sliding window context
        return this.generateSlidingWindowContext();
    }
}
