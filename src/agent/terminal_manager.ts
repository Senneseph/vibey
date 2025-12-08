
import * as cp from 'child_process';
import * as vscode from 'vscode';

interface ActiveProcess {
    process: cp.ChildProcess;
    outputBuffer: string;
}

export class TerminalManager {
    private processes: Map<string, ActiveProcess> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor(private workspaceRoot: string) {
        this.outputChannel = vscode.window.createOutputChannel("Vibey Agent");
    }

    public runCommand(command: string): Promise<string> {
        this.outputChannel.appendLine(`> Running: ${command}`);
        return new Promise((resolve, reject) => {
            cp.exec(command, { cwd: this.workspaceRoot }, (error, stdout, stderr) => {
                if (stdout) {
                    this.outputChannel.appendLine(stdout);
                }
                if (stderr) {
                    this.outputChannel.appendLine(`ERR: ${stderr}`);
                }

                if (error) {
                    resolve(`Error: ${error.message}\nStderr: ${stderr}`);
                } else {
                    resolve(stdout || stderr || "Command completed with no output.");
                }
            });
        });
    }

    public startProcess(id: string, command: string, args: string[] = []) {
        if (this.processes.has(id)) {
            throw new Error(`Process with ID ${id} already exists.`);
        }

        this.outputChannel.appendLine(`> Starting Process [${id}]: ${command} ${args.join(' ')}`);

        const child = cp.spawn(command, args, {
            cwd: this.workspaceRoot,
            shell: true
        });

        const activeProc: ActiveProcess = {
            process: child,
            outputBuffer: ''
        };

        child.stdout?.on('data', (data) => {
            const str = data.toString();
            activeProc.outputBuffer += str;
            this.outputChannel.append(`[${id}] ${str}`);
        });

        child.stderr?.on('data', (data) => {
            const str = data.toString();
            activeProc.outputBuffer += str;
            this.outputChannel.append(`[${id} ERR] ${str}`);
        });

        child.on('close', (code) => {
            this.outputChannel.appendLine(`[${id}] Exited with code ${code}`);
            this.processes.delete(id);
        });

        this.processes.set(id, activeProc);
        return `Process ${id} started.`;
    }

    public writeProcess(id: string, input: string) {
        const proc = this.processes.get(id);
        if (!proc) throw new Error(`Process ${id} not found.`);

        if (proc.process.stdin) {
            proc.process.stdin.write(input + '\n');
            this.outputChannel.appendLine(`[${id} INPUT] ${input}`);
            return "Input sent.";
        }
        return "Process has no stdin.";
    }

    public readProcess(id: string): string {
        const proc = this.processes.get(id);
        if (!proc) throw new Error(`Process ${id} not found.`);

        const output = proc.outputBuffer;
        proc.outputBuffer = ''; // Clear buffer after read
        return output || "(No new output)";
    }

    public killProcess(id: string) {
        const proc = this.processes.get(id);
        if (!proc) throw new Error(`Process ${id} not found.`);

        proc.process.kill();
        this.processes.delete(id);
        return `Process ${id} killed.`;
    }

    public listProcesses(): string[] {
        return Array.from(this.processes.keys());
    }
}
