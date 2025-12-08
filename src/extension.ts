
import * as vscode from 'vscode';
import { AgentOrchestrator } from './agent/orchestrator';
import { OllamaClient } from './llm/ollama';
import { ToolGateway } from './tools/gateway';
import { PolicyEngine } from './security/policy_engine';
import { createFileSystemTools } from './tools/definitions/filesystem';
import { ChatPanel } from './ui/ChatPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibey is now active!');

    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd();

    const policy = new PolicyEngine(workspaceRoot);
    const gateway = new ToolGateway(policy);

    // Register tools
    const fsTools = createFileSystemTools(policy);
    fsTools.forEach(t => gateway.registerTool(t));

    const llm = new OllamaClient();
    const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

    // 2. Register Webview Provider
    const chatProvider = new ChatPanel(context.extensionUri, orchestrator);

    // Register for Primary Sidebar
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatProvider)
    );

    // Register for Auxiliary Sidebar (Secondary)
    // Note: We reuse the same provider, allowing the user to interact with the same agent instance 
    // from either view (though state might reset if opened simultaneously depending on VS Code's behavior with same-instance providers,
    // usually it creates new webviews. ChatPanel handles new webviews in resolveWebviewView).
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('vibey.chatViewAux', chatProvider)
    );

    // 3. Register Commands
    const startCommand = vscode.commands.registerCommand('vibey.start', () => {
        vscode.commands.executeCommand('workbench.view.extension.vibey-sidebar');
    });

    const settingsCommand = vscode.commands.registerCommand('vibey.openSettings', () => {
        vscode.commands.executeCommand('workbench.action.openSettings', 'vibey');
    });

    context.subscriptions.push(startCommand);
    context.subscriptions.push(settingsCommand);
}

export function deactivate() { }
