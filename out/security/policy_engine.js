"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
const path = require("path");
class PolicyEngine {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    checkPathAccess(targetPath, mode) {
        const resolved = path.resolve(this.workspaceRoot, targetPath);
        // 1. Must be within workspace
        if (!resolved.startsWith(this.workspaceRoot)) {
            console.warn(`Blocked access to ${resolved} (outside workspace)`);
            return false;
        }
        // 2. Block sensitive files (basic)
        if (resolved.includes('.git') || resolved.includes('node_modules')) {
            // Allow reading node_modules? maybe. Block .git writes for sure.
            if (mode === 'write')
                return false;
        }
        return true;
    }
    checkCommand(command) {
        // Basic blocklist
        const blocked = ['rm -rf', 'mkfs', 'shutdown', 'reboot', 'dd '];
        if (blocked.some(b => command.includes(b))) {
            return false;
        }
        return true;
    }
}
exports.PolicyEngine = PolicyEngine;
//# sourceMappingURL=policy_engine.js.map