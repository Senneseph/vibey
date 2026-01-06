
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
            description: 'Scan project files and directories with flexible options. Can target specific directories, include file details like size and timestamps, and control scan depth.',
            parameters: z.object({
                path: z.string().optional().describe('Specific directory to scan (relative to workspace root). If omitted, scans entire workspace.'),
                includeDetails: z.boolean().optional().describe('Include file details like size and modification time'),
                maxDepth: z.number().optional().describe('Maximum directory depth to scan (1 = root only, 2 = root + immediate children, etc.)'),
                filePattern: z.string().optional().describe('Glob pattern to filter files (e.g., "*.ts", "*.js")')
            }),
            execute: async (params: { path?: string, includeDetails?: boolean, maxDepth?: number, filePattern?: string }) => {
                console.log(`[VIBEY][scan_project] Starting project scan with params:`, params);
                
                // Clear the context cache to ensure no cached data is included
                if ((global as any).vibeyContextManager) {
                    (global as any).vibeyContextManager.clearMasterContext();
                    (global as any).vibeyContextManager.clearAllCheckpointContext();
                    console.log(`[VIBEY][scan_project] Cleared context cache`);
                }

                // Determine the starting directory
                const scanPath = params.path ? resolvePath(params.path) : workspaceRoot;
                if (!policy.checkPathAccess(scanPath, 'read')) {
                    throw new Error(`Access Denied by Policy: ${scanPath}`);
                }

                // Read .vibeyignore file if it exists
                let ig: any = ignore();
                try {
                    const vibeyignorePath = path.join(workspaceRoot, '.vibeyignore');
                    const vibeyignoreContent = await fs.readFile(vibeyignorePath, 'utf-8');
                    ig.add(vibeyignoreContent);
                    console.log(`[VIBEY][scan_project] Loaded .vibeyignore with ${vibeyignoreContent.split('\n').length} rules`);
                } catch (e) {
                    // .vibeyignore file does not exist, proceed without it
                    console.log(`[VIBEY][scan_project] No .vibeyignore file found, proceeding without exclusions`);
                    ig = undefined;
                }

                // Simple recursive file walk respecting basic excludes and .vibeyignore
                const entries: string[] = [];
                let totalTokens = 0;
                const MAX_TOKENS = 200; // Very conservative token limit
                let fileCount = 0;
                let dirCount = 0;
                let ignoredCount = 0;

                async function walk(dir: string, currentDepth: number = 0) {
                    // Check max depth if specified
                    if (params.maxDepth && currentDepth >= params.maxDepth) {
                        return;
                    }

                    const files = await fs.readdir(dir, { withFileTypes: true });
                    for (const file of files) {
                        const relative = path.relative(workspaceRoot, path.join(dir, file.name));
                        const fullPath = path.join(dir, file.name);

                        // Basic Excludes
                        if (file.name === '.git' || file.name === 'node_modules' || file.name === '.DS_Store' || file.name === 'out' || file.name === 'dist') {
                            if (file.isDirectory()) {
                                entries.push(relative + '/ (ignored)');
                                ignoredCount++;
                            }
                            continue;
                        }

                        // Check .vibeyignore
                        if (ig && ig.ignores(relative)) {
                            if (file.isDirectory()) {
                                entries.push(relative + '/ (ignored)');
                                ignoredCount++;
                            }
                            continue;
                        }

                        if (file.isDirectory()) {
                            dirCount++;
                            await walk(fullPath, currentDepth + 1);
                        } else {
                            // Apply file pattern filter if specified
                            if (params.filePattern) {
                                const pattern = params.filePattern.replace(/\*/g, '.*').replace(/\?/g, '.');
                                const regex = new RegExp(pattern + '$');
                                if (!regex.test(relative)) {
                                    continue;
                                }
                            }

                            if (params.includeDetails) {
                                try {
                                    const stats = await fs.stat(fullPath);
                                    const sizeKB = Math.round(stats.size / 1024);
                                    const mtime = stats.mtime.toISOString();
                                    entries.push(`${relative} (${sizeKB} KB, modified: ${mtime})`);
                                    // Estimate token count for detailed entry
                                    totalTokens += Math.ceil(relative.length / 4) + 20; // Extra for details
                                } catch (e) {
                                    entries.push(relative);
                                    totalTokens += Math.ceil(relative.length / 4);
                                }
                            } else {
                                entries.push(relative);
                                totalTokens += Math.ceil(relative.length / 4);
                            }

                            fileCount++;
                            if (totalTokens > MAX_TOKENS) {
                                // If token limit is exceeded, return only the root directory
                                console.log(`[VIBEY][scan_project] Token limit exceeded (${totalTokens}/${MAX_TOKENS}), switching to root-only scan`);
                                return;
                            }
                        }
                    }
                }

                await walk(scanPath);
                
                if (totalTokens > MAX_TOKENS) {
                    // Return only the root directory of the scanned path
                    const rootFiles = await fs.readdir(scanPath, { withFileTypes: true });
                    const rootEntries: string[] = [];
                    let rootFileCount = 0;
                    let rootDirCount = 0;
                    
                    for (const file of rootFiles) {
                        const relative = path.relative(workspaceRoot, path.join(scanPath, file.name));
                        if (file.isDirectory()) {
                            rootEntries.push(relative + '/');
                            rootDirCount++;
                        } else {
                            rootEntries.push(relative);
                            rootFileCount++;
                        }
                    }
                    
                    const scannedPathRelative = params.path || 'workspace root';
                    const summary = `📁 Project Structure Summary (Root Level - Token limit exceeded)

📊 Statistics:
- Files: ${rootFileCount}
- Directories: ${rootDirCount}
- Total entries: ${rootEntries.length}

🗂️ Root Directory Contents (${scannedPathRelative}):
${rootEntries.join('\n')}

⚠️  Note: Full scan was truncated due to token limits. Use specific file/directory tools for detailed exploration.`;
                    
                    console.log(`[VIBEY][scan_project] Completed root-level scan: ${rootFileCount} files, ${rootDirCount} directories`);
                    return summary;
                }
                
                const scannedPathRelative = params.path || 'workspace root';
                const detailsInfo = params.includeDetails ? ' with file details' : '';
                const depthInfo = params.maxDepth ? ` (max depth: ${params.maxDepth})` : '';
                const patternInfo = params.filePattern ? ` (pattern: ${params.filePattern})` : '';
                
                const summary = `📁 Project Structure Summary${detailsInfo}${depthInfo}${patternInfo}

📊 Statistics:
- Files: ${fileCount}
- Directories: ${dirCount}
- Ignored entries: ${ignoredCount}
- Total entries: ${entries.length}

🗂️ Project Files (${scannedPathRelative}):
${entries.join('\n')}

🎯 Ready for analysis!`;
                
                console.log(`[VIBEY][scan_project] Completed full scan: ${fileCount} files, ${dirCount} directories, ${ignoredCount} ignored`);
                return summary;
            }
        }
    ];
}
