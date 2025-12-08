/**
 * Enhanced Terminal Manager for Vibey
 * Uses VS Code's integrated terminal with custom icons, shell preferences, and history
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
    ShellType,
    ShellConfig,
    DEFAULT_SHELLS,
    VibeyTerminalState,
    TerminalCommandEntry,
    TerminalHistory,
    CreateTerminalOptions,
    CommandResult,
    TerminalEvent,
    TerminalEventListener
} from './types';

/** Generate unique terminal ID */
function generateId(): string {
    return `vibey-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export class VibeyTerminalManager {
    private terminals: Map<string, vscode.Terminal> = new Map();
    private terminalStates: Map<string, VibeyTerminalState> = new Map();
    private history: TerminalHistory;
    private eventListeners: TerminalEventListener[] = [];
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    // For tracking output via writeEmitter approach
    private terminalOutputBuffers: Map<string, string> = new Map();

    constructor(
        private workspaceRoot: string,
        private context: vscode.ExtensionContext,
        private iconPath: string
    ) {
        // Load history from storage
        this.history = this.context.globalState.get<TerminalHistory>('vibey.terminalHistory') || {
            entries: [],
            maxEntries: 500
        };

        this.outputChannel = vscode.window.createOutputChannel('Vibey Terminal');

        // Watch for terminal close events
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
                this.handleTerminalClosed(terminal);
            })
        );

        // Watch for active terminal changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTerminal(terminal => {
                if (terminal) {
                    this.updateActiveState(terminal);
                }
            })
        );
    }

    /** Get preferred shell from settings */
    private getPreferredShell(): ShellType {
        const config = vscode.workspace.getConfiguration('vibey');
        return config.get<ShellType>('preferredShell') || 'auto';
    }

    /** Get shell configuration for current platform */
    private getShellConfig(shellType: ShellType): ShellConfig | undefined {
        const platform = process.platform;
        const shells = DEFAULT_SHELLS[platform] || DEFAULT_SHELLS.linux;

        if (shellType === 'auto') {
            return undefined; // Use VS Code default
        }

        return shells[shellType];
    }

    /** Get the icon path for terminals */
    private getIconPath(): vscode.Uri | vscode.ThemeIcon {
        // Use the Vibey terminal icon
        return vscode.Uri.file(this.iconPath);
    }

    /** Create a new Vibey terminal */
    public async createTerminal(options: CreateTerminalOptions = {}): Promise<string> {
        const shellType = options.shellType || this.getPreferredShell();
        const shellConfig = this.getShellConfig(shellType);

        const terminalId = generateId();
        const terminalName = options.name || `Vibey ${this.terminals.size + 1}`;

        const terminalOptions: vscode.TerminalOptions = {
            name: terminalName,
            cwd: options.cwd || this.workspaceRoot,
            iconPath: this.getIconPath()
        };

        // Set shell if not auto
        if (shellConfig) {
            terminalOptions.shellPath = shellConfig.path;
            terminalOptions.shellArgs = shellConfig.args;
        }

        const terminal = vscode.window.createTerminal(terminalOptions);

        this.terminals.set(terminalId, terminal);
        this.terminalOutputBuffers.set(terminalId, '');

        const state: VibeyTerminalState = {
            id: terminalId,
            name: terminalName,
            shellType: shellType,
            createdAt: Date.now(),
            isActive: true
        };
        this.terminalStates.set(terminalId, state);

        this.emitEvent({ type: 'terminal-created', terminalId });
        this.outputChannel.appendLine(`[Terminal] Created: ${terminalName} (${terminalId})`);

        return terminalId;
    }

    /** Get or create a terminal (reuse existing if requested) */
    public async getOrCreateTerminal(options: CreateTerminalOptions = {}): Promise<string> {
        if (options.reuseExisting) {
            // Find an existing active Vibey terminal
            for (const [id, state] of this.terminalStates.entries()) {
                if (state.isActive) {
                    this.outputChannel.appendLine(`[Terminal] Reusing: ${state.name} (${id})`);
                    return id;
                }
            }
        }
        return this.createTerminal(options);
    }

    /** Send a command to a terminal */
    public async sendCommand(terminalId: string, command: string): Promise<void> {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) {
            throw new Error(`Terminal ${terminalId} not found`);
        }

        const state = this.terminalStates.get(terminalId);
        if (state) {
            state.lastCommandAt = Date.now();
        }

        // Record in history
        const entry: TerminalCommandEntry = {
            id: generateId(),
            terminalId,
            command,
            executedAt: Date.now()
        };
        this.addHistoryEntry(entry);

        // Send the command
        terminal.sendText(command);
        this.outputChannel.appendLine(`[Terminal ${terminalId}] > ${command}`);

        this.emitEvent({ type: 'command-executed', terminalId, data: { command } });
    }

    /**
     * Run a command and wait for output
     * Note: VS Code terminals don't provide direct output capture.
     * We use a workaround with shell redirection or rely on sendText + manual check.
     */
    public async runCommand(
        command: string,
        options: CreateTerminalOptions = {}
    ): Promise<CommandResult> {
        const terminalId = await this.getOrCreateTerminal({ ...options, reuseExisting: true });
        const startTime = Date.now();

        await this.sendCommand(terminalId, command);

        // Since VS Code terminals don't provide output programmatically,
        // we return success and the user/LLM should observe the terminal
        return {
            success: true,
            output: `Command sent to terminal. Check terminal "${this.terminalStates.get(terminalId)?.name}" for output.`,
            terminalId,
            command,
            duration: Date.now() - startTime
        };
    }

    /** Show a terminal */
    public showTerminal(terminalId: string, preserveFocus: boolean = true): void {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.show(preserveFocus);
        }
    }

    /** Hide a terminal */
    public hideTerminal(terminalId: string): void {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.hide();
        }
    }

    /** Close a terminal */
    public closeTerminal(terminalId: string): void {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.dispose();
            this.terminals.delete(terminalId);
            this.terminalStates.delete(terminalId);
            this.terminalOutputBuffers.delete(terminalId);
        }
    }

    /** List all Vibey terminals */
    public listTerminals(): VibeyTerminalState[] {
        return Array.from(this.terminalStates.values());
    }

    /** Get terminal state by ID */
    public getTerminalState(terminalId: string): VibeyTerminalState | undefined {
        return this.terminalStates.get(terminalId);
    }

    /** Get command history */
    public getHistory(limit?: number): TerminalCommandEntry[] {
        const entries = this.history.entries;
        if (limit) {
            return entries.slice(-limit);
        }
        return entries;
    }

    /** Get history for a specific terminal */
    public getTerminalHistory(terminalId: string): TerminalCommandEntry[] {
        return this.history.entries.filter(e => e.terminalId === terminalId);
    }

    /** Clear history */
    public async clearHistory(): Promise<void> {
        this.history.entries = [];
        await this.saveHistory();
    }

    /** Add event listener */
    public addEventListener(listener: TerminalEventListener): void {
        this.eventListeners.push(listener);
    }

    /** Remove event listener */
    public removeEventListener(listener: TerminalEventListener): void {
        const idx = this.eventListeners.indexOf(listener);
        if (idx >= 0) {
            this.eventListeners.splice(idx, 1);
        }
    }

    /** Dispose all resources */
    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        // Note: We don't close terminals on dispose to preserve user work
        this.outputChannel.dispose();
    }

    // --- Private helpers ---

    private handleTerminalClosed(terminal: vscode.Terminal): void {
        // Find which of our terminals was closed
        for (const [id, t] of this.terminals.entries()) {
            if (t === terminal) {
                const state = this.terminalStates.get(id);
                if (state) {
                    state.isActive = false;
                }
                this.terminals.delete(id);
                this.terminalOutputBuffers.delete(id);
                this.emitEvent({ type: 'terminal-closed', terminalId: id });
                this.outputChannel.appendLine(`[Terminal] Closed: ${state?.name || id}`);
                break;
            }
        }
    }

    private updateActiveState(activeTerminal: vscode.Terminal): void {
        for (const [id, terminal] of this.terminals.entries()) {
            const state = this.terminalStates.get(id);
            if (state) {
                state.isActive = (terminal === activeTerminal);
            }
        }
    }

    private addHistoryEntry(entry: TerminalCommandEntry): void {
        this.history.entries.push(entry);

        // Trim if over max
        if (this.history.entries.length > this.history.maxEntries) {
            this.history.entries = this.history.entries.slice(-this.history.maxEntries);
        }

        // Save async
        this.saveHistory();
    }

    private async saveHistory(): Promise<void> {
        await this.context.globalState.update('vibey.terminalHistory', this.history);
    }

    private emitEvent(event: TerminalEvent): void {
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[VibeyTerminal] Event listener error:', e);
            }
        }
    }
}
