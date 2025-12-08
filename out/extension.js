"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const orchestrator_1 = require("./agent/orchestrator");
const ollama_1 = require("./llm/ollama");
const gateway_1 = require("./tools/gateway");
const policy_engine_1 = require("./security/policy_engine");
const filesystem_1 = require("./tools/definitions/filesystem");
const ChatPanel_1 = require("./ui/ChatPanel");
function activate(context) {
    console.log('Vibey is now active!');
    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd(); // Fallback if no folder open
    const policy = new policy_engine_1.PolicyEngine(workspaceRoot);
    const gateway = new gateway_1.ToolGateway(policy);
    // Register tools
    const fsTools = (0, filesystem_1.createFileSystemTools)(policy);
    fsTools.forEach(t => gateway.registerTool(t));
    const llm = new ollama_1.OllamaClient(); // Defaults to localhost:11434
    const orchestrator = new orchestrator_1.AgentOrchestrator(llm, gateway, workspaceRoot);
    // 2. Register Webview Provider
    const chatProvider = new ChatPanel_1.ChatPanel(context.extensionUri, orchestrator);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatPanel_1.ChatPanel.viewType, chatProvider));
    // 3. Register Commands
    const startCommand = vscode.commands.registerCommand('vibey.start', () => {
        // Focus the chat view
        vscode.commands.executeCommand('workbench.view.extension.vibey-sidebar');
    });
    context.subscriptions.push(startCommand);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map