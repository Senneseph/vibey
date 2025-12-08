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
        : process.cwd();
    const policy = new policy_engine_1.PolicyEngine(workspaceRoot);
    const gateway = new gateway_1.ToolGateway(policy);
    // Register tools
    const fsTools = (0, filesystem_1.createFileSystemTools)(policy);
    fsTools.forEach(t => gateway.registerTool(t));
    const llm = new ollama_1.OllamaClient();
    const orchestrator = new orchestrator_1.AgentOrchestrator(llm, gateway, workspaceRoot);
    // 2. Register Webview Provider
    const chatProvider = new ChatPanel_1.ChatPanel(context.extensionUri, orchestrator);
    // Register for Primary Sidebar
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatPanel_1.ChatPanel.viewType, chatProvider));
    // Register for Auxiliary Sidebar (Secondary)
    // Note: We reuse the same provider, allowing the user to interact with the same agent instance 
    // from either view (though state might reset if opened simultaneously depending on VS Code's behavior with same-instance providers,
    // usually it creates new webviews. ChatPanel handles new webviews in resolveWebviewView).
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('vibey.chatViewAux', chatProvider));
    // 3. Register Commands
    const startCommand = vscode.commands.registerCommand('vibey.start', () => {
        vscode.commands.executeCommand('workbench.view.extension.vibey-sidebar');
    });
    const settingsCommand = vscode.commands.registerCommand('vibey.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'vibey');
    });
    const selectModelCommand = vscode.commands.registerCommand('vibey.selectModel', async () => {
        try {
            const models = await llm.listModels();
            if (models.length === 0) {
                vscode.window.showErrorMessage('No Ollama models found. Is Ollama running?');
                return;
            }
            const selected = await vscode.window.showQuickPick(models, {
                placeHolder: 'Select an Ollama model'
            });
            if (selected) {
                await vscode.workspace.getConfiguration('vibey').update('model', selected, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Vibey model set to: ${selected}`);
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Failed to select model: ${err.message}`);
        }
    });
    context.subscriptions.push(startCommand);
    context.subscriptions.push(settingsCommand);
    context.subscriptions.push(selectModelCommand);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map