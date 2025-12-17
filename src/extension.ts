import * as vscode from 'vscode';
import * as path from 'path';
import { AgentOrchestrator } from './agent/orchestrator';
import { OllamaClient } from './llm/ollama';
import { OpenAICompatibleClient } from './llm/openai_compatible';
import { ToolGateway } from './tools/gateway';
import { PolicyEngine } from './security/policy_engine';

import { createFileSystemTools } from './tools/definitions/filesystem';
import { createPatchTools } from './tools/definitions/patch';

import { createManageTaskTool } from './tools/definitions/tasks';
import { TaskManager } from './agent/task_manager';
import { ChatPanel } from './ui/ChatPanel';
import { MicPanel } from './ui/MicPanel';

import { VibeyTerminalManager } from './agent/terminal';
import { createTerminalTools } from './tools/definitions/terminal';
import { createEditorTools } from './tools/definitions/editor';
import { DailyHistoryManager } from './agent/daily_history_manager';
import { McpService } from './agent/mcp/mcp_service';
import { MetricsCollector } from './agent/metrics/metrics_collector';
import { createSearchTools } from './tools/definitions/search';
import { ContextManager } from './agent/context_manager';

// Module-level references for cleanup
let mcpService: McpService | undefined;
let terminalManager: VibeyTerminalManager | undefined;
let metricsCollector: MetricsCollector | undefined;

export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('[VIBEY][activate] Vibey is now active!');

        // 1. Initialize Components
        const workspaceRoot = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : process.cwd();

        console.log('[VIBEY][activate] Workspace Root:', workspaceRoot);

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

        // Register search tools
        const searchTools = createSearchTools(new ContextManager());
        searchTools.forEach(t => gateway.registerTool(t));

        // Initialize MCP Service for external tool discovery
        mcpService = new McpService(gateway, context);
        mcpService.initialize().catch(err => {
            console.error('[Vibey] Failed to initialize MCP service:', err);
        });

        // Create LLM provider based on configuration
        const config = vscode.workspace.getConfiguration('vibey');
        const provider = config.get<string>('provider') || 'ollama';
        let llm: any;
        
        if (provider === 'openai-compatible') {
            llm = new OpenAICompatibleClient();
        } else {
            llm = new OllamaClient();
        }
        
        const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

        const historyManager = new DailyHistoryManager(context, workspaceRoot);

        // Export metrics collector for use in LLM provider
        const vibeyExtension = vscode.extensions.getExtension('vibey.vibey');
        if (vibeyExtension && vibeyExtension.exports) {
            vibeyExtension.exports.metricsCollector = metricsCollector;
        }

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
                const config = vscode.workspace.getConfiguration('vibey');
                const provider = config.get<string>('provider') || 'ollama';
                
                let models: string[] = [];
                
                if (provider === 'openai-compatible') {
                    const openaiClient = new OpenAICompatibleClient();
                    models = await openaiClient.listModels();
                } else {
                    const ollamaClient = new OllamaClient();
                    models = await ollamaClient.listModels();
                }
                
                if (models.length === 0) {
                    vscode.window.showErrorMessage('No models found. Is the server running?');
                    return;
                }

                const selected = await vscode.window.showQuickPick([...models, 'Clear Context'], {
                    placeHolder: 'Select a model or action'
                });

                if (selected === 'Clear Context') {
                    const contextManager = new ContextManager();
                    contextManager.clearMasterContext();
                    vscode.window.showInformationMessage('Context cleared. Starting fresh!');
                } else if (selected) {
                    await vscode.workspace.getConfiguration('vibey').update('model', selected, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`Vibey model set to: ${selected}`);
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(`Failed to select model: ${err.message}`);
            }
        });

        // Voice Input Command - opens a WebviewPanel for microphone access
        const voiceInputCommand = vscode.commands.registerCommand('vibey.voiceInput', () => {
            MicPanel.createOrShow(context.extensionUri, (transcript: string) => {
                // Send transcript to the chat panel
                chatProvider.addTranscriptToInput(transcript);
            });
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

        const diagnosticCommand = vscode.commands.registerCommand('vibey.diagnostics', async () => {
            const config = vscode.workspace.getConfiguration('vibey');
            const provider = config.get<string>('provider') || 'ollama';
            const model = config.get<string>('model') || 'Qwen3-coder:latest';
            const baseUrl = provider === 'openai-compatible' 
                ? config.get<string>('openaiBaseUrl') || 'http://localhost:11434/v1'
                : config.get<string>('ollamaUrl') || 'http://localhost:11434';

            vscode.window.showInformationMessage('🔍 Running Vibey diagnostics...', { modal: true });

            try {
                // Test connection based on provider
                console.log('[VIBEY][Diagnostic] Testing connection...');
                let isHealthy = false;
                let models = [];
                
                if (provider === 'openai-compatible') {
                    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
                    const modelsEndpoint = `${normalizedBaseUrl}/models`;
                    const response = await fetch(modelsEndpoint, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(config.get<string>('openaiApiKey') ? {'Authorization': `Bearer ${config.get<string>('openaiApiKey')}`} : {})
                        }
                    });
                    isHealthy = response.ok;
                    
                    if (isHealthy) {
                        const data = await response.json() as {
                            data: Array<{
                                id: string;
                                object: string;
                                created: number;
                            }>
                        };
                        models = data.data.map(m => m.id);
                    }
                } else {
                    const response = await fetch(`${baseUrl}/api/tags`);
                    isHealthy = response.ok;
                    
                    if (isHealthy) {
                        const data = await response.json() as any;
                        models = data.models || [];
                    }
                }

                let diagnosticsText = `Vibey Diagnostics Report\n\n`;
                diagnosticsText += `Provider Settings:\n`;
                diagnosticsText += `- Provider: ${provider}\n`;
                diagnosticsText += `- Model: ${model}\n`;
                diagnosticsText += `- Endpoint: ${baseUrl}\n`;
                diagnosticsText += `- Connection: ${isHealthy ? '✅ OK' : '❌ FAILED'}\n\n`;

                if (isHealthy) {
                    diagnosticsText += `Available Models (${models.length}):
`;
                    models.forEach((m: any) => {
                        const isCurrentModel = m === model;
                        diagnosticsText += `${isCurrentModel ? '✓' : ' '} ${m}\n`;
                    });
                } else {
                    if (provider === 'openai-compatible') {
                        diagnosticsText += `❌ Cannot reach OpenAI-compatible endpoint.\n`;
                        diagnosticsText += `Make sure:\n`;
                        diagnosticsText += `1. Server is running at ${baseUrl}\n`;
                        diagnosticsText += `2. Check URL is correct: vibey.openaiBaseUrl setting = ${baseUrl}\n`;
                        diagnosticsText += `3. Check API key is correct if required\n`;
                        diagnosticsText += `4. Check network connectivity\n`;
                    } else {
                        diagnosticsText += `❌ Cannot reach Ollama server.\n`;
                        diagnosticsText += `Make sure:\n`;
                        diagnosticsText += `1. Run: ollama serve\n`;
                        diagnosticsText += `2. Check URL is correct: vibey.ollamaUrl setting = ${baseUrl}\n`;
                        diagnosticsText += `3. Check firewall/network\n`;
                    }
                }

                console.log('[VIBEY][Diagnostic] Diagnostics:\n' + diagnosticsText);
                vscode.window.showInformationMessage('Diagnostics complete. Check Extension Host output for details.', { modal: true });
            } catch (error) {
                console.error('[VIBEY][Diagnostic] Error:', error);
                vscode.window.showErrorMessage(`Diagnostic failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });

        const clearHistoryCommand = vscode.commands.registerCommand('vibey.clearHistory', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'Are you sure you want to clear all chat history? This cannot be undone.',
                { modal: true },
                'Clear History'
            );

            if (confirm === 'Clear History') {
                try {
                    await historyManager.clearHistory();
                    await chatProvider.clearChatPanel();
                    vscode.window.showInformationMessage('✅ Chat history cleared successfully!');
                } catch (error) {
                    console.error('[VIBEY][ClearHistory] Error:', error);
                    vscode.window.showErrorMessage(`Failed to clear history: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        });

        context.subscriptions.push(startCommand);
        context.subscriptions.push(settingsCommand);
        context.subscriptions.push(selectModelCommand);
        context.subscriptions.push(voiceInputCommand);
        context.subscriptions.push(mcpStatusCommand);
        context.subscriptions.push(mcpReloadCommand);
        context.subscriptions.push(mcpListToolsCommand);
        context.subscriptions.push(diagnosticCommand);
        context.subscriptions.push(clearHistoryCommand);

        console.log('[VIBEY][activate] Extension activated successfully!');
    } catch (error: any) {
        console.error('[VIBEY][activate] ❌ Extension activation failed:', error);
        console.error('[VIBEY][activate] Error name:', error?.name);
        console.error('[VIBEY][activate] Error message:', error?.message);
        console.error('[VIBEY][activate] Stack:', error?.stack);
        vscode.window.showErrorMessage(
            `Vibey failed to activate: ${error?.message || 'Unknown error'}. Check Extension Host output for details.`
        );
    }
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