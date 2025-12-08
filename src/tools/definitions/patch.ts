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
            name: 'str_replace',
            description: 'Replace a specific string in a file with new content. The old_str must match EXACTLY (including whitespace and indentation). Use this for precise edits.',
            parameters: z.object({
                path: z.string().describe('Path to the file to edit'),
                old_str: z.string().describe('The exact string to find and replace (must match exactly)'),
                new_str: z.string().describe('The new string to replace old_str with')
            }),
            execute: async (params: { path: string, old_str: string, new_str: string }) => {
                const fullPath = resolvePath(params.path);

                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }

                const existingContent = await fs.readFile(fullPath, 'utf-8');

                // Check if old_str exists in the file
                if (!existingContent.includes(params.old_str)) {
                    throw new Error(`old_str not found in file. Make sure it matches exactly including whitespace.`);
                }

                // Check for multiple occurrences
                const occurrences = existingContent.split(params.old_str).length - 1;
                if (occurrences > 1) {
                    throw new Error(`old_str found ${occurrences} times. It must be unique. Add more context to make it unique.`);
                }

                // Perform the replacement
                const newContent = existingContent.replace(params.old_str, params.new_str);
                await fs.writeFile(fullPath, newContent);

                return `Successfully replaced content in ${fullPath}`;
            }
        },
        {
            name: 'insert_after',
            description: 'Insert new content after a specific string in a file. The marker string must match exactly.',
            parameters: z.object({
                path: z.string().describe('Path to the file to edit'),
                marker: z.string().describe('The exact string after which to insert new content'),
                content: z.string().describe('The content to insert after the marker')
            }),
            execute: async (params: { path: string, marker: string, content: string }) => {
                const fullPath = resolvePath(params.path);

                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }

                const existingContent = await fs.readFile(fullPath, 'utf-8');

                if (!existingContent.includes(params.marker)) {
                    throw new Error(`Marker string not found in file.`);
                }

                const occurrences = existingContent.split(params.marker).length - 1;
                if (occurrences > 1) {
                    throw new Error(`Marker found ${occurrences} times. It must be unique.`);
                }

                const newContent = existingContent.replace(params.marker, params.marker + params.content);
                await fs.writeFile(fullPath, newContent);

                return `Successfully inserted content after marker in ${fullPath}`;
            }
        },
        {
            name: 'apply_patch',
            description: 'Apply a unified diff patch to a file. Supports standard unified diff format with @@ line markers.',
            parameters: z.object({
                path: z.string(),
                patch: z.string().describe('Unified diff format patch content')
            }),
            execute: async (params: { path: string, patch: string }) => {
                const fullPath = resolvePath(params.path);

                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }

                const existingContent = await fs.readFile(fullPath, 'utf-8');
                const patchedContent = applyUnifiedPatch(existingContent, params.patch);
                await fs.writeFile(fullPath, patchedContent);

                return `Successfully applied patch to ${fullPath}`;
            }
        }
    ];
}

/**
 * Apply a unified diff patch to content
 * Supports basic unified diff format with @@ -start,count +start,count @@ markers
 */
function applyUnifiedPatch(content: string, patch: string): string {
    const lines = content.split('\n');
    const patchLines = patch.split('\n');

    // Parse hunks from the patch
    const hunks: Array<{
        oldStart: number;
        oldCount: number;
        newStart: number;
        newCount: number;
        changes: Array<{ type: 'context' | 'remove' | 'add'; line: string }>;
    }> = [];

    let currentHunk: typeof hunks[0] | null = null;

    for (const patchLine of patchLines) {
        // Skip file headers
        if (patchLine.startsWith('---') || patchLine.startsWith('+++')) {
            continue;
        }

        // Parse hunk header
        const hunkMatch = patchLine.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
            if (currentHunk) {
                hunks.push(currentHunk);
            }
            currentHunk = {
                oldStart: parseInt(hunkMatch[1], 10),
                oldCount: parseInt(hunkMatch[2] || '1', 10),
                newStart: parseInt(hunkMatch[3], 10),
                newCount: parseInt(hunkMatch[4] || '1', 10),
                changes: []
            };
            continue;
        }

        if (currentHunk) {
            if (patchLine.startsWith('-')) {
                currentHunk.changes.push({ type: 'remove', line: patchLine.slice(1) });
            } else if (patchLine.startsWith('+')) {
                currentHunk.changes.push({ type: 'add', line: patchLine.slice(1) });
            } else if (patchLine.startsWith(' ') || patchLine === '') {
                currentHunk.changes.push({ type: 'context', line: patchLine.slice(1) || '' });
            }
        }
    }

    if (currentHunk) {
        hunks.push(currentHunk);
    }

    if (hunks.length === 0) {
        throw new Error('No valid hunks found in patch. Use unified diff format with @@ markers.');
    }

    // Apply hunks in reverse order to preserve line numbers
    const result = [...lines];
    for (const hunk of hunks.reverse()) {
        const startIndex = hunk.oldStart - 1; // Convert to 0-based
        let removeCount = 0;
        const addLines: string[] = [];

        for (const change of hunk.changes) {
            if (change.type === 'remove' || change.type === 'context') {
                removeCount++;
            }
            if (change.type === 'add' || change.type === 'context') {
                addLines.push(change.line);
            }
        }

        // Only count actual removals, not context lines
        const actualRemoves = hunk.changes.filter(c => c.type === 'remove').length;
        const actualAdds = hunk.changes.filter(c => c.type === 'add').map(c => c.line);

        // Find the context and apply changes
        result.splice(startIndex, hunk.oldCount, ...actualAdds.concat(
            hunk.changes.filter(c => c.type === 'context').map(c => c.line)
        ));
    }

    return result.join('\n');
}