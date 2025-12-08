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
const tasks_1 = require("./tools/definitions/tasks");
const task_manager_1 = require("./agent/task_manager");
const ChatPanel_1 = require("./ui/ChatPanel");
const terminal_manager_1 = require("./agent/terminal_manager");
const terminal_1 = require("./tools/definitions/terminal");
const history_manager_1 = require("./agent/history_manager");
function activate(context) {
    console.log('Vibey is now active!');
    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd();
    console.log('Vibey Workspace Root:', workspaceRoot);
    const policy = new policy_engine_1.PolicyEngine(workspaceRoot);
    const gateway = new gateway_1.ToolGateway(policy);
    const taskManager = new task_manager_1.TaskManager();
    // Register tools
    const fsTools = (0, filesystem_1.createFileSystemTools)(policy, workspaceRoot);
    fsTools.forEach(t => gateway.registerTool(t));
    gateway.registerTool((0, tasks_1.createManageTaskTool)(taskManager));
    const terminalManager = new terminal_manager_1.TerminalManager(workspaceRoot);
    const terminalTools = (0, terminal_1.createTerminalTools)(terminalManager);
    terminalTools.forEach(t => gateway.registerTool(t));
    const llm = new ollama_1.OllamaClient();
    const orchestrator = new orchestrator_1.AgentOrchestrator(llm, gateway, workspaceRoot);
    const historyManager = new history_manager_1.HistoryManager(context);
    // 2. Register Webview Provider
    const chatProvider = new ChatPanel_1.ChatPanel(context.extensionUri, orchestrator, taskManager, historyManager);
    // Register for Primary Sidebar
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ChatPanel_1.ChatPanel.viewType, chatProvider));
    // Register for Auxiliary Sidebar (Secondary)
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