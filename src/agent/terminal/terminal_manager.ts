/**
 * Enhanced Terminal Manager for Vibey
 * Uses VS Code's integrated terminal with custom icons, shell preferences, and history
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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
    TerminalEventListener,
    ExecuteCommandOptions
} from './types';

/** Generate unique terminal ID */
function generateId(): string {
    return `vibey-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
     * Run a command and capture output using best available method:
     * 1. Shell Integration API (VS Code 1.93+) - preferred
     * 2. File-based output redirection - fallback
     * 3. No capture (legacy) - last resort
     */
    public async runCommand(
        command: string,
        options: ExecuteCommandOptions = {}
    ): Promise<CommandResult> {
        const terminalId = await this.getOrCreateTerminal({ ...options, reuseExisting: true });
        const terminal = this.terminals.get(terminalId);
        const startTime = Date.now();

        if (!terminal) {
            throw new Error(`Terminal ${terminalId} not found`);
        }

        if (options.showTerminal !== false) {
            terminal.show(true);
        }

        // Try Shell Integration API first (VS Code 1.93+)
        const shellIntegration = (terminal as any).shellIntegration;
        if (shellIntegration) {
            return this.runWithShellIntegration(terminal, terminalId, command, startTime, options.timeout);
        }

        // Fallback to file-based output capture
        return this.runWithFileRedirect(terminal, terminalId, command, startTime, options.timeout);
    }

    /**
     * Execute command using VS Code Shell Integration API
     * This provides proper output capture when available
     */
    private async runWithShellIntegration(
        terminal: vscode.Terminal,
        terminalId: string,
        command: string,
        startTime: number,
        timeout: number = 30000
    ): Promise<CommandResult> {
        const shellIntegration = (terminal as any).shellIntegration;

        try {
            // Execute command via shell integration
            const execution = shellIntegration.executeCommand(command);

            // Collect output from the stream
            let output = '';
            const stream = execution.read();

            // Read with timeout
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Command timeout')), timeout);
            });

            const readPromise = (async () => {
                for await (const data of stream) {
                    output += data;
                }
                return output;
            })();

            output = await Promise.race([readPromise, timeoutPromise]);

            // Get exit code if available
            const exitCode = execution.exitCode;

            // Record in history with output
            const entry: TerminalCommandEntry = {
                id: generateId(),
                terminalId,
                command,
                executedAt: startTime,
                output: output.substring(0, 10000), // Limit stored output
                exitCode,
                duration: Date.now() - startTime
            };
            this.addHistoryEntry(entry);

            this.outputChannel.appendLine(`[Terminal ${terminalId}] Command completed (shell integration)`);
            this.emitEvent({ type: 'command-completed', terminalId, data: { command, exitCode, output } });

            return {
                success: exitCode === undefined || exitCode === 0,
                output,
                terminalId,
                command,
                duration: Date.now() - startTime,
                exitCode,
                captureMethod: 'shell_integration'
            };
        } catch (error: any) {
            this.outputChannel.appendLine(`[Terminal ${terminalId}] Shell integration error: ${error.message}`);
            // Fall back to file redirect
            return this.runWithFileRedirect(terminal, terminalId, command, startTime, timeout);
        }
    }

    /**
     * Execute command with file-based output redirection
     * Works on all platforms but requires shell-specific syntax
     */
    private async runWithFileRedirect(
        terminal: vscode.Terminal,
        terminalId: string,
        command: string,
        startTime: number,
        timeout: number = 30000
    ): Promise<CommandResult> {
        const tempDir = os.tmpdir();
        const outputFile = path.join(tempDir, `vibey-output-${terminalId}-${Date.now()}.txt`);
        const exitCodeFile = path.join(tempDir, `vibey-exit-${terminalId}-${Date.now()}.txt`);

        const state = this.terminalStates.get(terminalId);
        const shellType = state?.shellType || 'auto';

        // Build redirect command based on shell type
        const redirectCommand = this.buildRedirectCommand(command, outputFile, exitCodeFile, shellType);

        // Send the redirected command
        terminal.sendText(redirectCommand);
        this.outputChannel.appendLine(`[Terminal ${terminalId}] > ${command} (file redirect)`);

        // Poll for output file with timeout
        const pollInterval = 100;
        const maxPolls = timeout / pollInterval;
        let polls = 0;
        let output = '';
        let exitCode: number | undefined;

        while (polls < maxPolls) {
            await this.sleep(pollInterval);
            polls++;

            // Check if exit code file exists (indicates command completed)
            if (fs.existsSync(exitCodeFile)) {
                try {
                    const exitCodeStr = fs.readFileSync(exitCodeFile, 'utf-8').trim();
                    exitCode = parseInt(exitCodeStr, 10);
                    if (isNaN(exitCode)) exitCode = undefined;
                } catch { /* ignore */ }

                // Read output
                if (fs.existsSync(outputFile)) {
                    try {
                        output = fs.readFileSync(outputFile, 'utf-8');
                    } catch { /* ignore */ }
                }

                // Cleanup temp files
                this.cleanupTempFiles(outputFile, exitCodeFile);
                break;
            }
        }

        // Record in history
        const entry: TerminalCommandEntry = {
            id: generateId(),
            terminalId,
            command,
            executedAt: startTime,
            output: output.substring(0, 10000),
            exitCode,
            duration: Date.now() - startTime
        };
        this.addHistoryEntry(entry);

        const timedOut = polls >= maxPolls;
        if (timedOut) {
            this.cleanupTempFiles(outputFile, exitCodeFile);
            output = `Command timed out after ${timeout}ms. Check terminal for output.`;
        }

        this.emitEvent({ type: 'command-completed', terminalId, data: { command, exitCode, output } });

        return {
            success: !timedOut && (exitCode === undefined || exitCode === 0),
            output: output || 'No output captured',
            terminalId,
            command,
            duration: Date.now() - startTime,
            exitCode,
            captureMethod: 'file_redirect'
        };
    }

    /**
     * Build a command with output redirection based on shell type
     */
    private buildRedirectCommand(command: string, outputFile: string, exitCodeFile: string, shellType: ShellType): string {
        const platform = process.platform;

        // Determine actual shell (for 'auto', guess based on platform)
        let actualShell = shellType;
        if (shellType === 'auto') {
            actualShell = platform === 'win32' ? 'powershell' : 'bash';
        }

        // Escape paths for the shell
        const outPath = outputFile.replace(/\\/g, '/');
        const exitPath = exitCodeFile.replace(/\\/g, '/');

        switch (actualShell) {
            case 'powershell':
                // PowerShell: capture output and exit code
                return `& { ${command} } 2>&1 | Out-File -FilePath "${outPath}" -Encoding utf8; $LASTEXITCODE | Out-File -FilePath "${exitPath}" -Encoding utf8`;

            case 'cmd':
                // CMD: use > for redirect, %ERRORLEVEL% for exit code
                return `(${command}) > "${outPath}" 2>&1 & echo %ERRORLEVEL% > "${exitPath}"`;

            case 'bash':
            case 'zsh':
            case 'sh':
            default:
                // Unix shells: redirect stdout+stderr, capture exit code
                return `{ ${command}; } > "${outPath}" 2>&1; echo $? > "${exitPath}"`;
        }
    }

    private cleanupTempFiles(...files: string[]): void {
        for (const file of files) {
            try {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            } catch { /* ignore cleanup errors */ }
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    /** Get the last command output for a terminal */
    public getLastOutput(terminalId: string): string | undefined {
        const terminalHistory = this.getTerminalHistory(terminalId);
        if (terminalHistory.length === 0) return undefined;
        return terminalHistory[terminalHistory.length - 1].output;
    }

    /** Get the last N command outputs for a terminal */
    public getRecentOutputs(terminalId: string, count: number = 5): TerminalCommandEntry[] {
        const terminalHistory = this.getTerminalHistory(terminalId);
        return terminalHistory.slice(-count);
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
