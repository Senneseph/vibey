/**
 * Terminal tools for Vibey agent
 * Provides capabilities for terminal creation, command execution, and management
 */

import { ToolDefinition } from '../schema';
import { VibeyTerminalManager, ShellType } from '../../agent/terminal';
import { z } from 'zod';

const shellTypeSchema = z.enum(['powershell', 'cmd', 'bash', 'zsh', 'sh', 'fish', 'auto']).optional();

export function createTerminalTools(terminal: VibeyTerminalManager): ToolDefinition[] {
    return [
        {
            name: 'terminal_create',
            description: 'Create a new Vibey terminal. Returns a terminal ID.',
            parameters: z.object({
                name: z.string().optional().describe('Custom name for the terminal'),
                shell: shellTypeSchema.describe('Shell type: powershell, cmd, bash, zsh, sh, fish, or auto'),
                cwd: z.string().optional().describe('Working directory for the terminal')
            }),
            execute: async (params: { name?: string; shell?: ShellType; cwd?: string }) => {
                const terminalId = await terminal.createTerminal({
                    name: params.name,
                    shellType: params.shell,
                    cwd: params.cwd
                });
                terminal.showTerminal(terminalId);
                return `Terminal created with ID: ${terminalId}`;
            }
        },
        {
            name: 'terminal_run',
            description: 'Run a command in a Vibey terminal and capture output. Reuses existing or creates new.',
            parameters: z.object({
                command: z.string().describe('The command to run'),
                shell: shellTypeSchema.describe('Shell type preference'),
                newTerminal: z.boolean().optional().describe('Force create a new terminal'),
                timeout: z.number().optional().describe('Timeout in ms (default 30000)')
            }),
            execute: async (params: { command: string; shell?: ShellType; newTerminal?: boolean; timeout?: number }) => {
                const result = await terminal.runCommand(params.command, {
                    shellType: params.shell,
                    reuseExisting: !params.newTerminal,
                    timeout: params.timeout
                });
                terminal.showTerminal(result.terminalId);

                // Return structured output
                const response = {
                    terminalId: result.terminalId,
                    command: params.command,
                    success: result.success,
                    exitCode: result.exitCode,
                    output: result.output,
                    captureMethod: result.captureMethod,
                    duration: result.duration
                };
                return JSON.stringify(response, null, 2);
            }
        },
        {
            name: 'terminal_send',
            description: 'Send a command to a specific terminal by ID.',
            parameters: z.object({
                terminalId: z.string().describe('The terminal ID'),
                command: z.string().describe('The command to send')
            }),
            execute: async (params: { terminalId: string; command: string }) => {
                await terminal.sendCommand(params.terminalId, params.command);
                return `Command sent to terminal ${params.terminalId}`;
            }
        },
        {
            name: 'terminal_list',
            description: 'List all Vibey terminals with their IDs and status.',
            parameters: z.object({}),
            execute: async () => {
                const terminals = terminal.listTerminals();
                if (terminals.length === 0) {
                    return 'No Vibey terminals are currently open.';
                }
                return terminals.map(t =>
                    `- ${t.id}: "${t.name}" (${t.shellType}, ${t.isActive ? 'active' : 'inactive'})`
                ).join('\n');
            }
        },
        {
            name: 'terminal_show',
            description: 'Show/focus a terminal by ID.',
            parameters: z.object({ terminalId: z.string() }),
            execute: async (params: { terminalId: string }) => {
                terminal.showTerminal(params.terminalId, false);
                return `Terminal ${params.terminalId} is now visible.`;
            }
        },
        {
            name: 'terminal_close',
            description: 'Close a terminal by ID.',
            parameters: z.object({ terminalId: z.string() }),
            execute: async (params: { terminalId: string }) => {
                terminal.closeTerminal(params.terminalId);
                return `Terminal ${params.terminalId} closed.`;
            }
        },
        {
            name: 'terminal_history',
            description: 'Get command history for terminals including output.',
            parameters: z.object({
                terminalId: z.string().optional().describe('Filter by terminal ID'),
                limit: z.number().optional().describe('Max entries (default 20)'),
                includeOutput: z.boolean().optional().describe('Include command output (default false)')
            }),
            execute: async (params: { terminalId?: string; limit?: number; includeOutput?: boolean }) => {
                const limit = params.limit || 20;
                const entries = params.terminalId
                    ? terminal.getTerminalHistory(params.terminalId)
                    : terminal.getHistory(limit);
                if (entries.length === 0) return 'No history available.';

                if (params.includeOutput) {
                    return JSON.stringify(entries.slice(-limit).map(e => ({
                        time: new Date(e.executedAt).toISOString(),
                        command: e.command,
                        output: e.output || null,
                        exitCode: e.exitCode,
                        duration: e.duration
                    })), null, 2);
                }

                return entries.slice(-limit).map(e => {
                    const time = new Date(e.executedAt).toLocaleTimeString();
                    return `[${time}] ${e.command}`;
                }).join('\n');
            }
        },
        {
            name: 'terminal_read_output',
            description: 'Read the output from the last command(s) in a terminal.',
            parameters: z.object({
                terminalId: z.string().describe('The terminal ID to read from'),
                count: z.number().optional().describe('Number of recent commands to read (default 1)')
            }),
            execute: async (params: { terminalId: string; count?: number }) => {
                const count = params.count || 1;
                const outputs = terminal.getRecentOutputs(params.terminalId, count);

                if (outputs.length === 0) {
                    return JSON.stringify({ error: 'No output available for this terminal' });
                }

                if (count === 1) {
                    const last = outputs[outputs.length - 1];
                    return JSON.stringify({
                        command: last.command,
                        output: last.output || 'No output captured',
                        exitCode: last.exitCode,
                        executedAt: new Date(last.executedAt).toISOString()
                    }, null, 2);
                }

                return JSON.stringify(outputs.map(o => ({
                    command: o.command,
                    output: o.output || 'No output captured',
                    exitCode: o.exitCode,
                    executedAt: new Date(o.executedAt).toISOString()
                })), null, 2);
            }
        }
    ];
}
