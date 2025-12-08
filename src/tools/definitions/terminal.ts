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
            description: 'Run a command in a Vibey terminal. Reuses existing or creates new.',
            parameters: z.object({
                command: z.string().describe('The command to run'),
                shell: shellTypeSchema.describe('Shell type preference'),
                newTerminal: z.boolean().optional().describe('Force create a new terminal')
            }),
            execute: async (params: { command: string; shell?: ShellType; newTerminal?: boolean }) => {
                const result = await terminal.runCommand(params.command, {
                    shellType: params.shell,
                    reuseExisting: !params.newTerminal
                });
                terminal.showTerminal(result.terminalId);
                return `Ran in terminal ${result.terminalId}: ${params.command}`;
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
            description: 'Get command history for terminals.',
            parameters: z.object({
                terminalId: z.string().optional().describe('Filter by terminal ID'),
                limit: z.number().optional().describe('Max entries (default 20)')
            }),
            execute: async (params: { terminalId?: string; limit?: number }) => {
                const limit = params.limit || 20;
                const entries = params.terminalId
                    ? terminal.getTerminalHistory(params.terminalId)
                    : terminal.getHistory(limit);
                if (entries.length === 0) return 'No history available.';
                return entries.slice(-limit).map(e => {
                    const time = new Date(e.executedAt).toLocaleTimeString();
                    return `[${time}] ${e.command}`;
                }).join('\n');
            }
        }
    ];
}
