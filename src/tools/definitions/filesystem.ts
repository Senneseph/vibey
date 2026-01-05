
import * as fs from 'fs/promises';
import { ToolDefinition } from '../schema';
import { PolicyEngine } from '../../security/policy_engine';
import { z } from 'zod';
import * as path from 'path';
import ignore from 'ignore';

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
                // Clear the context cache to ensure no cached data is included
                if ((global as any).vibeyContextManager) {
                    (global as any).vibeyContextManager.clearMasterContext();
                    (global as any).vibeyContextManager.clearAllCheckpointContext();
                }

                // Read .vibeyignore file if it exists
                let ig: any = ignore();
                try {
                    const vibeyignorePath = path.join(workspaceRoot, '.vibeyignore');
                    const vibeyignoreContent = await fs.readFile(vibeyignorePath, 'utf-8');
                    ig.add(vibeyignoreContent);
                } catch (e) {
                    // .vibeyignore file does not exist, proceed without it
                    ig = undefined;
                }

                // Simple recursive file walk respecting basic excludes and .vibeyignore
                const entries: string[] = [];
                let totalTokens = 0;
                const MAX_TOKENS = 200; // Very conservative token limit

                async function walk(dir: string) {
                    const files = await fs.readdir(dir, { withFileTypes: true });
                    for (const file of files) {
                        const relative = path.relative(workspaceRoot, path.join(dir, file.name));
                        const fullPath = path.join(dir, file.name);

                        // Basic Excludes
                        if (file.name === '.git' || file.name === 'node_modules' || file.name === '.DS_Store' || file.name === 'out' || file.name === 'dist') {
                            if (file.isDirectory()) {
                                entries.push(relative + '/ (ignored)');
                            }
                            continue;
                        }

                        // Check .vibeyignore
                        if (ig && ig.ignores(relative)) {
                            if (file.isDirectory()) {
                                entries.push(relative + '/ (ignored)');
                            }
                            continue;
                        }

                        if (file.isDirectory()) {
                            await walk(fullPath);
                        } else {
                            entries.push(relative);
                            // Estimate token count (roughly 4 characters per token)
                            totalTokens += Math.ceil(relative.length / 4);
                            if (totalTokens > MAX_TOKENS) {
                                // If token limit is exceeded, return only the root directory
                                return;
                            }
                        }
                    }
                }

                await walk(workspaceRoot);
                if (totalTokens > MAX_TOKENS) {
                    // Return only the root directory
                    const rootFiles = await fs.readdir(workspaceRoot, { withFileTypes: true });
                    const rootEntries: string[] = [];
                    for (const file of rootFiles) {
                        const relative = path.relative(workspaceRoot, path.join(workspaceRoot, file.name));
                        if (file.isDirectory()) {
                            rootEntries.push(relative + '/');
                        } else {
                            rootEntries.push(relative);
                        }
                    }
                    return `Project Files (${rootEntries.length}):\n` + rootEntries.join('\n');
                }
                return `Project Files (${entries.length}):\n` + entries.join('\n');
            }
        }
    ];
}
