
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
}
