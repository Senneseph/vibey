
import * as fs from 'fs/promises';
import { ToolDefinition } from '../schema';
import { PolicyEngine } from '../../security/policy_engine';
import { z } from 'zod';


import * as path from 'path';

export function createFileSystemTools(policy: PolicyEngine, workspaceRoot: string): ToolDefinition[] {
    const resolvePath = (p: string) => {
        if (path.isAbsolute(p)) {
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
        }
        }

        await walk(workspaceRoot);
        return `Project Files (${entries.length}):\n` + entries.slice(0, 100).join('\n') + (entries.length > 100 ? `\n... ${entries.length - 100} more files` : '');
    }
}
    ];
}
