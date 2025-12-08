/**
 * Git Tools for Version Control Integration
 * Enables safe code management, branching, and experimentation
 */

import * as vscode from 'vscode';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolDefinition } from '../schema';

const execAsync = promisify(exec);

export interface GitContext {
    workspaceRoot: string;
}

async function runGit(cwd: string, args: string): Promise<{ stdout: string; stderr: string }> {
    try {
        return await execAsync(`git ${args}`, { cwd, maxBuffer: 10 * 1024 * 1024 });
    } catch (error: any) {
        throw new Error(error.stderr || error.message);
    }
}

export function createGitTools(context: GitContext): ToolDefinition[] {
    const { workspaceRoot } = context;

    return [
        {
            name: 'git_status',
            description: 'Get the current git status including branch, staged, and unstaged changes',
            parameters: z.object({}).optional(),
            execute: async () => {
                const { stdout: branch } = await runGit(workspaceRoot, 'branch --show-current');
                const { stdout: status } = await runGit(workspaceRoot, 'status --porcelain');
                const { stdout: lastCommit } = await runGit(workspaceRoot, 'log -1 --oneline');

                const lines = status.trim().split('\n').filter(Boolean);
                const staged = lines.filter(l => l[0] !== ' ' && l[0] !== '?');
                const unstaged = lines.filter(l => l[1] !== ' ' || l[0] === '?');

                return JSON.stringify({
                    branch: branch.trim(),
                    lastCommit: lastCommit.trim(),
                    staged: staged.map(l => ({ status: l.substring(0, 2), file: l.substring(3) })),
                    unstaged: unstaged.map(l => ({ status: l.substring(0, 2), file: l.substring(3) })),
                    clean: lines.length === 0
                });
            }
        },
        {
            name: 'git_diff',
            description: 'Show diff of changes. Can show staged, unstaged, or specific file changes',
            parameters: z.object({
                staged: z.boolean().optional().describe('Show staged changes only'),
                file: z.string().optional().describe('Show diff for specific file')
            }),
            execute: async (params: { staged?: boolean; file?: string }) => {
                let args = 'diff';
                if (params.staged) args += ' --staged';
                if (params.file) args += ` -- "${params.file}"`;

                const { stdout } = await runGit(workspaceRoot, args);
                return JSON.stringify({ diff: stdout || 'No changes' });
            }
        },
        {
            name: 'git_log',
            description: 'Show commit history with optional filtering',
            parameters: z.object({
                count: z.number().optional().default(10).describe('Number of commits to show'),
                oneline: z.boolean().optional().default(true).describe('Show one line per commit'),
                file: z.string().optional().describe('Show history for specific file'),
                author: z.string().optional().describe('Filter by author'),
                since: z.string().optional().describe('Show commits since date (e.g., "1 week ago")')
            }),
            execute: async (params: { count?: number; oneline?: boolean; file?: string; author?: string; since?: string }) => {
                let args = `log -n ${params.count || 10}`;
                if (params.oneline) args += ' --oneline';
                if (params.author) args += ` --author="${params.author}"`;
                if (params.since) args += ` --since="${params.since}"`;
                if (params.file) args += ` -- "${params.file}"`;

                const { stdout } = await runGit(workspaceRoot, args);
                return JSON.stringify({ log: stdout });
            }
        },
        {
            name: 'git_branch',
            description: 'List, create, or switch branches',
            parameters: z.object({
                action: z.enum(['list', 'create', 'switch', 'delete']).describe('Branch action'),
                name: z.string().optional().describe('Branch name for create/switch/delete'),
                base: z.string().optional().describe('Base branch for create (default: current)')
            }),
            execute: async (params: { action: string; name?: string; base?: string }) => {
                switch (params.action) {
                    case 'list': {
                        const { stdout } = await runGit(workspaceRoot, 'branch -a');
                        const branches = stdout.trim().split('\n').map(b => ({
                            name: b.replace(/^\*?\s+/, '').replace('remotes/', ''),
                            current: b.startsWith('*')
                        }));
                        return JSON.stringify({ branches });
                    }
                    case 'create': {
                        if (!params.name) throw new Error('Branch name required');
                        const base = params.base || 'HEAD';
                        await runGit(workspaceRoot, `branch "${params.name}" ${base}`);
                        return JSON.stringify({ success: true, message: `Created branch ${params.name}` });
                    }
                    case 'switch': {
                        if (!params.name) throw new Error('Branch name required');
                        await runGit(workspaceRoot, `checkout "${params.name}"`);
                        return JSON.stringify({ success: true, message: `Switched to ${params.name}` });
                    }
                    case 'delete': {
                        if (!params.name) throw new Error('Branch name required');
                        await runGit(workspaceRoot, `branch -d "${params.name}"`);
                        return JSON.stringify({ success: true, message: `Deleted branch ${params.name}` });
                    }
                    default:
                        throw new Error(`Unknown action: ${params.action}`);
                }
            }
        },
        {
            name: 'git_stage',
            description: 'Stage files for commit',
            parameters: z.object({
                files: z.array(z.string()).optional().describe('Files to stage (empty for all)'),
                all: z.boolean().optional().describe('Stage all changes')
            }),
            execute: async (params: { files?: string[]; all?: boolean }) => {
                if (params.all) {
                    await runGit(workspaceRoot, 'add -A');
                    return JSON.stringify({ success: true, message: 'Staged all changes' });
                }
                if (params.files && params.files.length > 0) {
                    const fileList = params.files.map(f => `"${f}"`).join(' ');
                    await runGit(workspaceRoot, `add ${fileList}`);
                    return JSON.stringify({ success: true, message: `Staged ${params.files.length} files` });
                }
                throw new Error('Specify files or use all:true');
            }
        },
        {
            name: 'git_unstage',
            description: 'Unstage files',
            parameters: z.object({
                files: z.array(z.string()).optional().describe('Files to unstage'),
                all: z.boolean().optional().describe('Unstage all')
            }),
            execute: async (params: { files?: string[]; all?: boolean }) => {
                if (params.all) {
                    await runGit(workspaceRoot, 'reset HEAD');
                    return JSON.stringify({ success: true, message: 'Unstaged all files' });
                }
                if (params.files && params.files.length > 0) {
                    const fileList = params.files.map(f => `"${f}"`).join(' ');
                    await runGit(workspaceRoot, `reset HEAD ${fileList}`);
                    return JSON.stringify({ success: true, message: `Unstaged ${params.files.length} files` });
                }
                throw new Error('Specify files or use all:true');
            }
        },
        {
            name: 'git_commit',
            description: 'Create a commit with staged changes',
            parameters: z.object({
                message: z.string().describe('Commit message'),
                amend: z.boolean().optional().describe('Amend the last commit')
            }),
            execute: async (params: { message: string; amend?: boolean }) => {
                let args = `commit -m "${params.message.replace(/"/g, '\\"')}"`;
                if (params.amend) args += ' --amend';

                const { stdout } = await runGit(workspaceRoot, args);
                return JSON.stringify({ success: true, output: stdout });
            }
        },
        {
            name: 'git_stash',
            description: 'Stash or restore changes',
            parameters: z.object({
                action: z.enum(['push', 'pop', 'list', 'drop']).describe('Stash action'),
                message: z.string().optional().describe('Stash message for push'),
                index: z.number().optional().describe('Stash index for pop/drop')
            }),
            execute: async (params: { action: string; message?: string; index?: number }) => {
                switch (params.action) {
                    case 'push': {
                        let args = 'stash push';
                        if (params.message) args += ` -m "${params.message}"`;
                        await runGit(workspaceRoot, args);
                        return JSON.stringify({ success: true, message: 'Changes stashed' });
                    }
                    case 'pop': {
                        const idx = params.index ?? 0;
                        await runGit(workspaceRoot, `stash pop stash@{${idx}}`);
                        return JSON.stringify({ success: true, message: 'Stash applied and removed' });
                    }
                    case 'list': {
                        const { stdout } = await runGit(workspaceRoot, 'stash list');
                        return JSON.stringify({ stashes: stdout.trim().split('\n').filter(Boolean) });
                    }
                    case 'drop': {
                        const idx = params.index ?? 0;
                        await runGit(workspaceRoot, `stash drop stash@{${idx}}`);
                        return JSON.stringify({ success: true, message: `Dropped stash@{${idx}}` });
                    }
                    default:
                        throw new Error(`Unknown action: ${params.action}`);
                }
            }
        },
        {
            name: 'git_reset',
            description: 'Reset changes (use with caution)',
            parameters: z.object({
                mode: z.enum(['soft', 'mixed', 'hard']).describe('Reset mode'),
                target: z.string().optional().default('HEAD').describe('Reset target (commit, HEAD~1, etc.)'),
                confirm: z.boolean().describe('Must be true for hard reset')
            }),
            execute: async (params: { mode: string; target?: string; confirm: boolean }) => {
                if (params.mode === 'hard' && !params.confirm) {
                    throw new Error('Hard reset requires confirm:true - this will lose uncommitted changes!');
                }
                const target = params.target || 'HEAD';
                await runGit(workspaceRoot, `reset --${params.mode} ${target}`);
                return JSON.stringify({ success: true, message: `Reset (${params.mode}) to ${target}` });
            }
        },
        {
            name: 'git_show',
            description: 'Show details of a commit',
            parameters: z.object({
                commit: z.string().optional().default('HEAD').describe('Commit hash or reference'),
                stat: z.boolean().optional().describe('Show file statistics only')
            }),
            execute: async (params: { commit?: string; stat?: boolean }) => {
                let args = `show ${params.commit || 'HEAD'}`;
                if (params.stat) args += ' --stat';

                const { stdout } = await runGit(workspaceRoot, args);
                return JSON.stringify({ output: stdout });
            }
        },
        {
            name: 'git_blame',
            description: 'Show who last modified each line of a file',
            parameters: z.object({
                file: z.string().describe('File to blame'),
                lines: z.string().optional().describe('Line range (e.g., "10,20")')
            }),
            execute: async (params: { file: string; lines?: string }) => {
                let args = `blame "${params.file}"`;
                if (params.lines) args += ` -L ${params.lines}`;

                const { stdout } = await runGit(workspaceRoot, args);
                return JSON.stringify({ blame: stdout });
            }
        }
    ];
}

