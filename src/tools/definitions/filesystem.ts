
import * as fs from 'fs/promises';
import { ToolDefinition } from '../schema';
import { PolicyEngine } from '../../security/policy_engine';
import { z } from 'zod';


import * as path from 'path';

export function createFileSystemTools(policy: PolicyEngine, workspaceRoot: string): ToolDefinition[] {
    const resolvePath = (p: string) => {
        if (path.isAbsolute(p)) {
            return p;
        }
        return path.join(workspaceRoot, p);
    };

    return [
        {
            name: 'read_file',
            description: 'Read file content. Relative paths are resolved against the workspace root.',
            parameters: z.object({ path: z.string() }),
            execute: async (params: { path: string }) => {
                const fullPath = resolvePath(params.path);
                if (!policy.checkPathAccess(fullPath, 'read')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                return await fs.readFile(fullPath, 'utf-8');
            }
        },
        {
            name: 'write_file',
            description: 'Write file content. Relative paths are resolved against the workspace root.',
            parameters: z.object({ path: z.string(), content: z.string() }),
            execute: async (params: { path: string, content: string }) => {
                const fullPath = resolvePath(params.path);
                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                // Ensure directory exists
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, params.content);
                return `Successfully wrote to ${fullPath}`;
            }
        },
        {
            name: 'scan_project',
            description: 'List all files in the workspace (excluding .git, node_modules, etc). Useful for understanding project structure.',
            parameters: z.object({}),
            execute: async () => {
                // Simple recursive file walk respecting basic excludes
                const entries: string[] = [];

                async function walk(dir: string) {
                    const files = await fs.readdir(dir, { withFileTypes: true });
                    for (const file of files) {
                        const relative = path.relative(workspaceRoot, path.join(dir, file.name));

                        // Basic Excludes
                        if (file.name === '.git' || file.name === 'node_modules' || file.name === '.DS_Store' || file.name === 'out' || file.name === 'dist') continue;

                        if (file.isDirectory()) {
                            await walk(path.join(dir, file.name));
                        } else {
                            entries.push(relative);
                        }
                    }
                }

                await walk(workspaceRoot);
                return `Project Files (${entries.length}):\n` + entries.slice(0, 100).join('\n') + (entries.length > 100 ? `\n... ${entries.length - 100} more files` : '');
            }
        }
    ];
}
