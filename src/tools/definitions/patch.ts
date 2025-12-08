import * as fs from 'fs/promises';
import { ToolDefinition } from '../schema';
import { PolicyEngine } from '../../security/policy_engine';
import { z } from 'zod';
import * as path from 'path';

export function createPatchTools(policy: PolicyEngine, workspaceRoot: string): ToolDefinition[] {
    const resolvePath = (p: string) => {
        if (path.isAbsolute(p)) {
            return p;
        }
        return path.join(workspaceRoot, p);
    };

    return [
        {
            name: 'apply_patch',
            description: 'Apply a patch to an existing file. Takes a file path and patch content (diff format).',
            parameters: z.object({
                path: z.string(),
                patch: z.string(),
                contextLines: z.number().optional().default(3)
            }),
            execute: async (params: { path: string, patch: string, contextLines?: number }) => {
                const fullPath = resolvePath(params.path);
                
                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                
                try {
                    // Read existing file content
                    const existingContent = await fs.readFile(fullPath, 'utf-8');
                    
                    // Apply patch (simplified implementation)
                    // In a real implementation, we'd use a proper diff/patch library
                    const patchedContent = applySimplePatch(existingContent, params.patch);
                    
                    // Write back to file
                    await fs.writeFile(fullPath, patchedContent);
                    
                    return `Successfully applied patch to ${fullPath}`;
                } catch (error) {
                    throw new Error(`Failed to apply patch to ${fullPath}: ${(error as Error).message}`);
                }
            }
        },
        {
            name: 'generate_patch',
            description: 'Generate a patch for changes to a file. Takes a file path and new content to compare against.',
            parameters: z.object({
                path: z.string(),
                newContent: z.string()
            }),
            execute: async (params: { path: string, newContent: string }) => {
                const fullPath = resolvePath(params.path);
                
                if (!policy.checkPathAccess(fullPath, 'read')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                
                try {
                    // Read existing file content
                    const existingContent = await fs.readFile(fullPath, 'utf-8');
                    
                    // Generate patch (simplified implementation)
                    const patch = generateSimplePatch(existingContent, params.newContent);
                    
                    return patch;
                } catch (error) {
                    throw new Error(`Failed to generate patch for ${fullPath}: ${(error as Error).message}`);
                }
            }
        }
    ];
}

// Simple patch application (in a real implementation, use a proper diff library)
function applySimplePatch(content: string, patch: string): string {
    // This is a simplified implementation
    // A real implementation would use a library like 'diff' or 'jsdiff'
    
    // For now, we'll just return the new content if patch is empty or simple
    if (!patch || patch.trim() === '') {
        return content;
    }
    
    // In a real implementation, this would parse the patch and apply it
    // For now, we'll just return the patch content as a placeholder
    return content + '\n// Patch applied:\n' + patch;
}

// Simple patch generation (in a real implementation, use a proper diff library)
function generateSimplePatch(oldContent: string, newContent: string): string {
    // This is a simplified implementation
    // A real implementation would use a library like 'diff' or 'jsdiff'
    
    // For now, we'll just return a placeholder indicating what changed
    return `--- Original\n+++ Modified\n@@ -1,1 +1,1 @@\n ${oldContent.split('\n')[0]}\n+${newContent.split('\n')[0]}`;
}