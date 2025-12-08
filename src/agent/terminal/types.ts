/**
 * Terminal types and interfaces for Vibey's terminal integration
 */

/** Supported shell types */
export type ShellType = 'powershell' | 'cmd' | 'bash' | 'zsh' | 'sh' | 'fish' | 'auto';

/** Shell configuration for each type */
export interface ShellConfig {
    path: string;
    args?: string[];
    displayName: string;
}

/** Default shell configurations per platform */
export const DEFAULT_SHELLS: Record<string, Record<ShellType, ShellConfig | undefined>> = {
    win32: {
        powershell: { path: 'powershell.exe', args: ['-NoLogo'], displayName: 'PowerShell' },
        cmd: { path: 'cmd.exe', displayName: 'Command Prompt' },
        bash: { path: 'bash.exe', displayName: 'Bash (WSL/Git)' },
        zsh: undefined,
        sh: undefined,
        fish: undefined,
        auto: undefined // Will use system default
    },
    linux: {
        powershell: { path: 'pwsh', displayName: 'PowerShell Core' },
        cmd: undefined,
        bash: { path: '/bin/bash', displayName: 'Bash' },
        zsh: { path: '/bin/zsh', displayName: 'Zsh' },
        sh: { path: '/bin/sh', displayName: 'Shell' },
        fish: { path: '/usr/bin/fish', displayName: 'Fish' },
        auto: undefined
    },
    darwin: {
        powershell: { path: 'pwsh', displayName: 'PowerShell Core' },
        cmd: undefined,
        bash: { path: '/bin/bash', displayName: 'Bash' },
        zsh: { path: '/bin/zsh', displayName: 'Zsh' },
        sh: { path: '/bin/sh', displayName: 'Shell' },
        fish: { path: '/usr/bin/fish', displayName: 'Fish' },
        auto: undefined
    }
};

/** Terminal state tracking */
export interface VibeyTerminalState {
    id: string;
    name: string;
    shellType: ShellType;
    createdAt: number;
    lastCommandAt?: number;
    isActive: boolean;
}

/** Command execution entry for history */
export interface TerminalCommandEntry {
    id: string;
    terminalId: string;
    command: string;
    executedAt: number;
    output?: string;
    exitCode?: number;
    duration?: number;
}

/** Full terminal history (persisted) */
export interface TerminalHistory {
    entries: TerminalCommandEntry[];
    maxEntries: number;
}

/** Terminal creation options */
export interface CreateTerminalOptions {
    /** Optional custom name for the terminal */
    name?: string;
    /** Shell type to use (defaults to user preference or 'auto') */
    shellType?: ShellType;
    /** Whether to reuse an existing Vibey terminal if available */
    reuseExisting?: boolean;
    /** Working directory */
    cwd?: string;
}

/** Result of running a command */
export interface CommandResult {
    success: boolean;
    output: string;
    terminalId: string;
    command: string;
    duration?: number;
}

/** Terminal event types */
export type TerminalEventType = 
    | 'terminal-created'
    | 'terminal-closed'
    | 'command-executed'
    | 'command-completed';

export interface TerminalEvent {
    type: TerminalEventType;
    terminalId: string;
    data?: any;
}

/** Event listener callback */
export type TerminalEventListener = (event: TerminalEvent) => void;

