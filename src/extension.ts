
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
        : process.cwd(); // Fallback if no folder open

    const policy = new PolicyEngine(workspaceRoot);
    const gateway = new ToolGateway(policy);

    // Register tools
    const fsTools = createFileSystemTools(policy);
    fsTools.forEach(t => gateway.registerTool(t));

    const llm = new OllamaClient(); // Defaults to localhost:11434
    const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

    // 2. Register Webview Provider
    const chatProvider = new ChatPanel(context.extensionUri, orchestrator);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatProvider)
    );

    // 3. Register Commands
    const startCommand = vscode.commands.registerCommand('vibey.start', () => {
        // Focus the chat view
        vscode.commands.executeCommand('workbench.view.extension.vibey-sidebar');
    });

    context.subscriptions.push(startCommand);
}

export function deactivate() { }
