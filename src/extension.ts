import * as vscode from 'vscode';
import * as path from 'path';
import { AgentOrchestrator } from './agent/orchestrator';
import { OllamaClient } from './llm/ollama';
import { ToolGateway } from './tools/gateway';
import { PolicyEngine } from './security/policy_engine';

import { createFileSystemTools } from './tools/definitions/filesystem';
import { createPatchTools } from './tools/definitions/patch';

import { createManageTaskTool } from './tools/definitions/tasks';
import { TaskManager } from './agent/task_manager';
import { ChatPanel } from './ui/ChatPanel';

import { VibeyTerminalManager } from './agent/terminal';
import { createTerminalTools } from './tools/definitions/terminal';
import { createEditorTools } from './tools/definitions/editor';
import { HistoryManager } from './agent/history_manager';
import { McpService } from './agent/mcp/mcp_service';
import { MetricsCollector } from './agent/metrics/metrics_collector';

// Module-level references for cleanup
let mcpService: McpService | undefined;
let terminalManager: VibeyTerminalManager | undefined;
let metricsCollector: MetricsCollector | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Vibey is now active!');

    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd();

    console.log('Vibey Workspace Root:', workspaceRoot);

    // Initialize metrics collector
    metricsCollector = new MetricsCollector(context);

    const policy = new PolicyEngine(workspaceRoot);
    const gateway = new ToolGateway(policy);
    const taskManager = new TaskManager();

    // Register built-in tools
    const fsTools = createFileSystemTools(policy, workspaceRoot);
    fsTools.forEach(t => gateway.registerTool(t));

    // Register patch tools
    const patchTools = createPatchTools(policy, workspaceRoot);
    patchTools.forEach(t => gateway.registerTool(t));

    gateway.registerTool(createManageTaskTool(taskManager));

    // Initialize enhanced terminal manager with custom icon and history persistence
    const terminalIconPath = path.join(context.extensionPath, 'src', 'ui', 'media', 'vibey-terminal.svg');
    terminalManager = new VibeyTerminalManager(workspaceRoot, context, terminalIconPath);
    const terminalTools = createTerminalTools(terminalManager);
    terminalTools.forEach(t => gateway.registerTool(t));

    // Register editor awareness tools
    const editorTools = createEditorTools();
    editorTools.forEach(t => gateway.registerTool(t));

    // Initialize MCP Service for external tool discovery
    mcpService = new McpService(gateway, context);
    mcpService.initialize().catch(err => {
        console.error('[Vibey] Failed to initialize MCP service:', err);
    });

    const llm = new OllamaClient();
    const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

    const historyManager = new HistoryManager(context, workspaceRoot);

    // Export metrics collector for use in LLM provider
    vscode.extensions.getExtension('vibey.vibey')?.exports.metricsCollector = metricsCollector;

    // 2. Register Webview Provider
    const chatProvider = new ChatPanel(context.extensionUri, orchestrator, taskManager, historyManager);

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

    // MCP Commands
    const mcpStatusCommand = vscode.commands.registerCommand('vibey.mcpStatus', () => {
        if (!mcpService) {
            vscode.window.showErrorMessage('MCP service not initialized');
            return;
        }
        const states = mcpService.getServerStates();
        if (states.length === 0) {
            vscode.window.showInformationMessage('No MCP servers configured. Add servers in settings (vibey.mcpServers)');
            return;
        }

        const statusLines = states.map(s => {
            const status = s.status === 'connected' ? '✅' : s.status === 'error' ? '❌' : '⏳';
            return `${status} ${s.name}: ${s.toolCount} tools, ${s.resourceCount} resources${s.error ? ` (${s.error})` : ''}`;
        });

        vscode.window.showInformationMessage(`MCP Servers:\n${statusLines.join('\n')}`);
    });

    const mcpReloadCommand = vscode.commands.registerCommand('vibey.mcpReload', async () => {
        if (!mcpService) {
            vscode.window.showErrorMessage('MCP service not initialized');
            return;
        }
        vscode.window.showInformationMessage('Reloading MCP servers...');
        await mcpService.reloadServers();
    });

    const mcpListToolsCommand = vscode.commands.registerCommand('vibey.mcpListTools', () => {
        const allTools = gateway.getToolDefinitions();
        const toolNames = allTools.map(t => t.name).sort();

        vscode.window.showQuickPick(toolNames, {
            placeHolder: 'Available tools (built-in + MCP)',
            canPickMany: false
        }).then(selected => {
            if (selected) {
                const tool = allTools.find(t => t.name === selected);
                if (tool) {
                    vscode.window.showInformationMessage(`${tool.name}: ${tool.description}`);
                }
            }
        });
    });

    context.subscriptions.push(startCommand);
    context.subscriptions.push(settingsCommand);
    context.subscriptions.push(selectModelCommand);
    context.subscriptions.push(mcpStatusCommand);
    context.subscriptions.push(mcpReloadCommand);
    context.subscriptions.push(mcpListToolsCommand);
}

export function getMetricsCollector(): MetricsCollector | undefined {
    return metricsCollector;
}

export async function deactivate() {
    if (mcpService) {
        await mcpService.dispose();
        mcpService = undefined;
    }
    if (terminalManager) {
        terminalManager.dispose();
        terminalManager = undefined;
    }
}