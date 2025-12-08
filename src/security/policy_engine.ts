
import * as path from 'path';

export class PolicyEngine {
    constructor(private workspaceRoot: string) { }

    checkPathAccess(targetPath: string, mode: 'read' | 'write'): boolean {
        const resolved = path.resolve(this.workspaceRoot, targetPath);

        // 1. Must be within workspace
        if (!resolved.startsWith(this.workspaceRoot)) {
            console.warn(`Blocked access to ${resolved} (outside workspace)`);
            return false;
        }

        // 2. Block sensitive files (basic)
        if (resolved.includes('.git') || resolved.includes('node_modules')) {
            // Allow reading node_modules? maybe. Block .git writes for sure.
            if (mode === 'write') return false;
        }

        return true;
    }

    checkCommand(command: string): boolean {
        // Basic blocklist
        const blocked = ['rm -rf', 'mkfs', 'shutdown', 'reboot', 'dd '];
        if (blocked.some(b => command.includes(b))) {
            return false;
        }
        return true;
    }
}
