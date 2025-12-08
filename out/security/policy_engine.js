"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEngine = void 0;
const path = __importStar(require("path"));
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