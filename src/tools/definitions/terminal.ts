
import { ToolDefinition } from '../schema';
import { TerminalManager } from '../../agent/terminal_manager';
import { z } from 'zod';

export function createTerminalTools(terminal: TerminalManager): ToolDefinition[] {
    return [
        {
            name: 'run_command',
            description: 'Run a shell command and wait for it to finish. Use this for short-lived commands like `ls`, `git status`, `cat`. Do NOT use for `npm start` or servers.',
            parameters: z.object({ command: z.string() }),
            execute: async (params: { command: string }) => {
                return await terminal.runCommand(params.command);
            }
        },
        {
            name: 'process_start',
            description: 'Start a long-running process (like a server or watcher). Returns a process ID.',
            parameters: z.object({
                id: z.string().describe('Unique ID for this process (e.g., "server")'),
                command: z.string(),
                args: z.array(z.string()).optional()
            }),
            execute: async (params: { id: string, command: string, args?: string[] }) => {
                return terminal.startProcess(params.id, params.command, params.args || []);
            }
        },
        {
            name: 'process_write',
            description: 'Write input to a running process (stdin).',
            parameters: z.object({ id: z.string(), input: z.string() }),
            execute: async (params: { id: string, input: string }) => {
                return terminal.writeProcess(params.id, params.input);
            }
        },
        {
            name: 'process_read',
            description: 'Read the latest output (stdout/stderr) from a process. Clears the buffer after reading.',
            parameters: z.object({ id: z.string() }),
            execute: async (params: { id: string }) => {
                return terminal.readProcess(params.id);
            }
        },
        {
            name: 'process_kill',
            description: 'Terminate a running process.',
            parameters: z.object({ id: z.string() }),
            execute: async (params: { id: string }) => {
                return terminal.killProcess(params.id);
            }
        }
    ];
}
