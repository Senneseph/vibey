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

import { VibeyTerminalManager } from './agent/terminal';
import { createTerminalTools } from './tools/definitions/terminal';
import { createEditorTools } from './tools/definitions/editor';
import { DailyHistoryManager } from './agent/daily_history_manager';
import { McpService } from './agent/mcp/mcp_service';
import { MetricsCollector } from './agent/metrics/metrics_collector';
import { createSearchTools } from './tools/definitions/search';
import { createMcpTools } from './tools/definitions/mcp';
import { ContextManager } from './agent/context_manager';
import { FeatureTestRunner, FeatureTestReport } from './agent/testing/test_runner';
import { McpMarketplaceView } from './ui/marketplace/McpMarketplaceView';
import { MemoryService } from './agent/mcp/memory_service';

// Module-level references for cleanup
let mcpService: McpService | undefined;
let terminalManager: VibeyTerminalManager | undefined;
let metricsCollector: MetricsCollector | undefined;
let memoryService: MemoryService | undefined;

export async function activate(context: vscode.ExtensionContext) {
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

        // Register MCP management tools (these allow the agent to query MCP server status)
        const mcpTools = createMcpTools(mcpService);
        mcpTools.forEach(t => gateway.registerTool(t));
        console.log('[VIBEY][activate] Registered MCP management tools');

        // Add event listeners for MCP service
        mcpService.addEventListener((event) => {
            console.log('[VIBEY][MCP] Event:', event.type, event);
            if (event.type === 'server-connected') {
                vscode.window.showInformationMessage(`✅ MCP Server connected: ${event.serverName}`);
            } else if (event.type === 'server-disconnected') {
                vscode.window.showWarningMessage(`🔌 MCP Server disconnected: ${event.serverName}`);
            } else if (event.type === 'server-error') {
                vscode.window.showErrorMessage(`❌ MCP Server error: ${event.serverName}: ${event.data?.error || 'Unknown error'}`);
            }
        });

        try {
            console.log('[VIBEY][activate] Initializing MCP service...');
            await mcpService.initialize();
            console.log('[VIBEY][activate] MCP service initialized successfully');

            // Check server states after initialization
            const serverStates = mcpService.getServerStates();
            console.log('[VIBEY][activate] MCP server states:', serverStates);

            // Check if built-in servers are disabled
            const config = vscode.workspace.getConfiguration('vibey');
            const disableFilesystem = config.get<boolean>('disableFilesystemServer', false);
            const disableOpenSpec = config.get<boolean>('disableOpenSpecServer', false);
            const builtinServersDisabled = disableFilesystem && disableOpenSpec;

            if (serverStates.length === 0 && builtinServersDisabled) {
                console.warn('[VIBEY][activate] No MCP servers available after initialization');
                vscode.window.showWarningMessage('No MCP servers configured. Using built-in tools only.');
            } else {
                const connectedServers = serverStates.filter(s => s.status === 'connected');
                if (connectedServers.length > 0) {
                    vscode.window.showInformationMessage(`✅ MCP: ${connectedServers.length} server(s) connected`);
                }
            }
        } catch (err: any) {
            console.error('[VIBEY][activate] ❌ Failed to initialize MCP service:', err);
            console.error('[VIBEY][activate] MCP Error details:', {
                name: err.name,
                message: err.message,
                stack: err.stack,
                cause: err.cause
            });
            vscode.window.showErrorMessage(`❌ MCP Service failed: ${err.message}. Check Extension Host output.`);
        }

        // Create LLM provider based on configuration
        const config = vscode.workspace.getConfiguration('vibey');
        const provider = config.get<string>('provider') || 'ollama';
        let llm: any;
        
        // Initialize Memory Service
        memoryService = new MemoryService(mcpService, context);
        
        // Load memory bank if enabled
        const memoryEnabled = config.get<boolean>('memoryBankEnabled', true);
        if (memoryEnabled) {
            try {
                await memoryService.loadMemoryBank();
                console.log('[VIBEY][activate] Memory service initialized successfully');
            } catch (error) {
                console.error('[VIBEY][activate] Failed to initialize memory service:', error);
            }
        }
        
        if (provider === 'openai-compatible') {
            llm = new OpenAICompatibleClient();
        } else {
            llm = new OllamaClient();
        }
        
        const orchestrator = new AgentOrchestrator(llm, gateway, workspaceRoot);

        const historyManager = new DailyHistoryManager(context, workspaceRoot);
        
        // Initialize feature test runner
        const featureTestRunner = new FeatureTestRunner(orchestrator, gateway, mcpService, taskManager, workspaceRoot);

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
                   // Reset the orchestrator's context - this will clear both the conversation history AND the context manager
                   orchestrator.resetContext();
                   
                   // Also clear the chat panel's history
                   const chatProvider = new ChatPanel(context.extensionUri, orchestrator, taskManager, historyManager);
                   await chatProvider.clearChatPanel();
                   
                   // Clear the history manager
                   await historyManager.clearHistory();
                   
                   // Clear the memory service if available
                   if (memoryService) {
                       await memoryService.clearMemoryBank();
                   }
                   
                   vscode.window.showInformationMessage('✅ All context cleared. Starting fresh!');
               } else if (selected) {
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
            
            // Check if built-in servers are disabled
            const config = vscode.workspace.getConfiguration('vibey');
            const disableFilesystem = config.get<boolean>('disableFilesystemServer', false);
            const disableOpenSpec = config.get<boolean>('disableOpenSpecServer', false);
            const builtinServersDisabled = disableFilesystem && disableOpenSpec;

            if (states.length === 0 && builtinServersDisabled) {
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

        const featureTestCommand = vscode.commands.registerCommand('vibey.runFeatureTests', async () => {
            try {
                vscode.window.showInformationMessage('🧪 Running Vibey feature tests...', { modal: true });
                
                const report = await featureTestRunner.runAllTests();
                
                // Show summary notification
                const successRate = report.summary.successRate;
                const message = successRate === 100
                    ? '✅ All tests passed! Vibey is working correctly.'
                    : `📊 Tests completed: ${report.summary.passedTests}/${report.summary.totalTests} passed (${successRate.toFixed(1)}%)`;
                
                vscode.window.showInformationMessage(message);
                
                // Show detailed report
                const troubleshootingReport = featureTestRunner.generateTroubleshootingReport(report);
                
                // Create a webview to show the detailed report
                const panel = vscode.window.createWebviewPanel(
                    'vibeyFeatureTestResults',
                    'Vibey Feature Test Results',
                    vscode.ViewColumn.One,
                    {}
                );
                
                panel.webview.html = getFeatureTestReportHtml(panel.webview, troubleshootingReport, report);
                
            } catch (error: any) {
                console.error('[VIBEY][FeatureTest] Error running tests:', error);
                vscode.window.showErrorMessage(`Feature tests failed: ${error.message}`);
            }
        });

        // MCP Marketplace Commands
        const showMarketplaceCommand = vscode.commands.registerCommand('vibey.showMcpMarketplace', () => {
            if (!mcpService) {
                vscode.window.showErrorMessage('MCP service not initialized');
                return;
            }
            const marketplaceView = new McpMarketplaceView(context, mcpService);
            marketplaceView.show();
        });

        const refreshMarketplaceCommand = vscode.commands.registerCommand('vibey.refreshMcpMarketplace', async () => {
            if (!mcpService) {
                vscode.window.showErrorMessage('MCP service not initialized');
                return;
            }
            vscode.window.showInformationMessage('Refreshing MCP marketplace...');
            await mcpService.refreshMarketplace();
            vscode.window.showInformationMessage('MCP marketplace refreshed successfully');
        });

        context.subscriptions.push(startCommand);
        context.subscriptions.push(settingsCommand);
        context.subscriptions.push(selectModelCommand);
        context.subscriptions.push(mcpStatusCommand);
        context.subscriptions.push(mcpReloadCommand);
        context.subscriptions.push(mcpListToolsCommand);
        context.subscriptions.push(diagnosticCommand);
        context.subscriptions.push(clearHistoryCommand);
        context.subscriptions.push(featureTestCommand);
        context.subscriptions.push(showMarketplaceCommand);
        context.subscriptions.push(refreshMarketplaceCommand);

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

function getFeatureTestReportHtml(webview: vscode.Webview, troubleshootingReport: string, report: FeatureTestReport): string {
    const successRate = report.summary.successRate;
    const successColor = successRate === 100 ? '#4CAF50' : successRate >= 75 ? '#FFC107' : '#F44336';
    
    // Convert markdown to HTML
    const markdownToHtml = (markdown: string): string => {
        return markdown
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/## ([^\n]+)/g, '<h2>$1</h2>')
            .replace(/### ([^\n]+)/g, '<h3>$1</h3>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
    };
    
    const troubleshootingHtml = markdownToHtml(troubleshootingReport);
    
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vibey Feature Test Results</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            
            h1, h2, h3 {
                color: #2c3e50;
            }
            
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px;
                margin-bottom: 30px;
                text-align: center;
            }
            
            .summary-card {
                background: white;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            .success-rate {
                font-size: 2em;
                font-weight: bold;
                color: ${successColor};
                text-align: center;
                margin: 20px 0;
            }
            
            .test-results {
                background: white;
                border-radius: 10px;
                padding: 20px;
                margin-bottom: 20px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            .test-feature {
                margin-bottom: 15px;
                padding-bottom: 15px;
                border-bottom: 1px solid #eee;
            }
            
            .test-feature:last-child {
                border-bottom: none;
            }
            
            .test-passed {
                color: #4CAF50;
                font-weight: bold;
            }
            
            .test-failed {
                color: #F44336;
                font-weight: bold;
            }
            
            .troubleshooting {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            
            code {
                background: #f5f5f5;
                padding: 2px 6px;
                border-radius: 4px;
                font-family: 'Courier New', monospace;
            }
            
            strong {
                color: #2c3e50;
            }
            
            em {
                color: #7f8c8d;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                margin: 20px 0;
            }
            
            .stat-card {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                text-align: center;
            }
            
            .stat-value {
                font-size: 1.5em;
                font-weight: bold;
                color: #667eea;
            }
            
            .stat-label {
                font-size: 0.9em;
                color: #7f8c8d;
                margin-top: 5px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🧪 Vibey Feature Test Results</h1>
            <p>LLM Provider: ${report.llmProvider} | Model: ${report.llmModel}</p>
        </div>
        
        <div class="summary-card">
            <h2>📊 Test Summary</h2>
            <div class="success-rate">
                Success Rate: ${successRate.toFixed(1)}%
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${report.summary.totalTests}</div>
                    <div class="stat-label">Total Tests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #4CAF50;">${report.summary.passedTests}</div>
                    <div class="stat-label">Passed</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #F44336;">${report.summary.failedTests}</div>
                    <div class="stat-label">Failed</div>
                </div>
            </div>
        </div>
        
        <div class="test-results">
        <h2>📋 Detailed Test Results</h2>
        ${report.results.map((result: any) => `
            <div class="test-feature">
                <h3>${result.feature}</h3>
                <p><strong>${result.testName}:</strong>
                <span class="${result.success ? 'test-passed' : 'test-failed'}">
                ${result.success ? '✅ PASSED' : '❌ FAILED'}
                </span></p>
                <p>${result.message}</p>
                ${result.details ? `<pre><code>${JSON.stringify(result.details, null, 2)}</code></pre>` : ''}
            </div>
        `).join('')}
    </div>
        
        <div class="troubleshooting">
            <h2>🔧 Troubleshooting Recommendations</h2>
            <div>${troubleshootingHtml}</div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #7f8c8d; font-size: 0.9em;">
            Generated on ${new Date(report.timestamp).toLocaleString()}
        </div>
    </body>
    </html>`;
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
    
    if (memoryService) {
        // Memory service doesn't need explicit disposal, but we can clear it
        memoryService = undefined;
    }
}