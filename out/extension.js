"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.getMetricsCollector = getMetricsCollector;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const orchestrator_1 = require("./agent/orchestrator");
const ollama_1 = require("./llm/ollama");
const gateway_1 = require("./tools/gateway");
const policy_engine_1 = require("./security/policy_engine");
const filesystem_1 = require("./tools/definitions/filesystem");
const patch_1 = require("./tools/definitions/patch");
const tasks_1 = require("./tools/definitions/tasks");
const task_manager_1 = require("./agent/task_manager");
const ChatPanel_1 = require("./ui/ChatPanel");
const terminal_1 = require("./agent/terminal");
const terminal_2 = require("./tools/definitions/terminal");
const editor_1 = require("./tools/definitions/editor");
const history_manager_1 = require("./agent/history_manager");
const mcp_service_1 = require("./agent/mcp/mcp_service");
const metrics_collector_1 = require("./agent/metrics/metrics_collector");
// Module-level references for cleanup
let mcpService;
let terminalManager;
let metricsCollector;
function activate(context) {
    console.log('Vibey is now active!');
    // 1. Initialize Components
    const workspaceRoot = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : process.cwd();
    console.log('Vibey Workspace Root:', workspaceRoot);
    // Initialize metrics collector
    metricsCollector = new metrics_collector_1.MetricsCollector(context);
    const policy = new policy_engine_1.PolicyEngine(workspaceRoot);
    const gateway = new gateway_1.ToolGateway(policy);
    const taskManager = new task_manager_1.TaskManager();
    // Register built-in tools
    const fsTools = (0, filesystem_1.createFileSystemTools)(policy, workspaceRoot);
    fsTools.forEach(t => gateway.registerTool(t));
    // Register patch tools
    const patchTools = (0, patch_1.createPatchTools)(policy, workspaceRoot);
    patchTools.forEach(t => gateway.registerTool(t));
    gateway.registerTool((0, tasks_1.createManageTaskTool)(taskManager));
    // Initialize enhanced terminal manager with custom icon and history persistence
    const terminalIconPath = path.join(context.extensionPath, 'src', 'ui', 'media', 'vibey-terminal.svg');
    terminalManager = new terminal_1.VibeyTerminalManager(workspaceRoot, context, terminalIconPath);
    const terminalTools = (0, terminal_2.createTerminalTools)(terminalManager);
    terminalTools.forEach(t => gateway.registerTool(t));
    // Register editor awareness tools
    const editorTools = (0, editor_1.createEditorTools)();
    editorTools.forEach(t => gateway.registerTool(t));
    // Initialize MCP Service for external tool discovery
    mcpService = new mcp_service_1.McpService(gateway, context);
    mcpService.initialize().catch(err => {
        console.error('[Vibey] Failed to initialize MCP service:', err);
    });
    const llm = new ollama_1.OllamaClient();
    const orchestrator = new orchestrator_1.AgentOrchestrator(llm, gateway, workspaceRoot);
    const historyManager = new history_manager_1.HistoryManager(context, workspaceRoot);
    // Export metrics collector for use in LLM provider
    const vibeyExtension = vscode.extensions.getExtension('vibey.vibey');
    if (vibeyExtension && vibeyExtension.exports) {
        vibeyExtension.exports.metricsCollector = metricsCollector;
    }
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
function getMetricsCollector() {
    return metricsCollector;
}
async function deactivate() {
    if (mcpService) {
        await mcpService.dispose();
        mcpService = undefined;
    }
    if (terminalManager) {
        terminalManager.dispose();
        terminalManager = undefined;
    }
}
//# sourceMappingURL=extension.js.map