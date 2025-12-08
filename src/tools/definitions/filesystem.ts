
import * as fs from 'fs/promises';
import { ToolDefinition } from '../schema';
import { PolicyEngine } from '../../security/policy_engine';
import { z } from 'zod';

export function createFileSystemTools(policy: PolicyEngine): ToolDefinition[] {
    return [
        {
            name: 'read_file',
            description: 'Read file content',
            parameters: z.object({ path: z.string() }),
            execute: async (params: { path: string }) => {
                if (!policy.checkPathAccess(params.path, 'read')) {
                    throw new Error('Access Denied by Policy');
                }
                return await fs.readFile(params.path, 'utf-8');
            }
        },
        {
            name: 'write_file',
            description: 'Write file content',
            parameters: z.object({ path: z.string(), content: z.string() }),
            execute: async (params: { path: string, content: string }) => {
                if (!policy.checkPathAccess(params.path, 'write')) {
                    throw new Error('Access Denied by Policy');
                }
                await fs.writeFile(params.path, params.content);
                return `Successfully wrote to ${params.path}`;
            }
        }
    ];
}
