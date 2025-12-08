"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolGateway = void 0;
// For this scaffold, we assume we might need to use real FS, but we are running in Node context really?
// Since it's a VS Code extension, we should use 'vscode.workspace.fs' usually, but 'fs' module works for local files too.
// We'll use 'fs/promises' for simplicity in this pure-code scaffold plan.
class ToolGateway {
    constructor(policy) {
        this.policy = policy;
        this.tools = new Map();
        // Register known tools here or via a register method
    }
    registerTool(tool) {
        this.tools.set(tool.name, tool);
    }
    unregisterTool(name) {
        this.tools.delete(name);
    }
    getToolDefinitions() {
        return Array.from(this.tools.values());
    }
    async executeTool(call) {
        const tool = this.tools.get(call.name);
        if (!tool) {
            return {
                role: 'tool_result',
                tool_call_id: call.id,
                status: 'error',
                error: `Tool ${call.name} not found`,
                output: ''
            };
        }
        // 1. Permission Check (Abstracted for now)
        // In a real extension, we'd show a VS Code InputBox/QuickPick here if approval needed.
        // For scaffold, we assume checks pass or PolicyEngine handled it.
        console.log(`[Gateway] Executing ${call.name}`);
        try {
            const output = await tool.execute(call.parameters, {});
            return {
                role: 'tool_result',
                tool_call_id: call.id,
                status: 'success',
                output: output
            };
        }
        catch (err) {
            return {
                role: 'tool_result',
                tool_call_id: call.id,
                status: 'error',
                error: err.message,
                output: ''
            };
        }
    }
}
exports.ToolGateway = ToolGateway;
//# sourceMappingURL=gateway.js.map