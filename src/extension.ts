
import * as vscode from 'vscode';
import { AgentOrchestrator } from './agent/orchestrator';
import { OllamaClient } from './llm/ollama';
import { ToolGateway } from './tools/gateway';
import { PolicyEngine } from './security/policy_engine';

import { createFileSystemTools } from './tools/definitions/filesystem';
import { createManageTaskTool } from './tools/definitions/tasks';
import { TaskManager } from './agent/task_manager';
import { ChatPanel } from './ui/ChatPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibey is now active!');

    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd();

    const policy = new PolicyEngine(workspaceRoot);
    const gateway = new ToolGateway(policy);
    const taskManager = new TaskManager();

    // Register tools
    const fsTools = createFileSystemTools(policy);
    fsTools.forEach(t => gateway.registerTool(t));

    gateway.registerTool(createManageTaskTool(taskManager));

    const llm = new OllamaClient();
    const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

    // 2. Register Webview Provider
    const chatProvider = new ChatPanel(context.extensionUri, orchestrator, taskManager);

    // Register for Primary Sidebar
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatPanel.viewType, chatProvider)
    );

    // Register for Auxiliary Sidebar (Secondary)
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
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to select model: ${err.message}`);
        }
    });

    context.subscriptions.push(startCommand);
    context.subscriptions.push(settingsCommand);
    context.subscriptions.push(selectModelCommand);
}

export function deactivate() { }
