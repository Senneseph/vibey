/**
 * MCP Settings View - UI component for browsing and managing MCP server configurations
 */

import * as vscode from 'vscode';
import { McpService } from '../../agent/mcp/mcp_service';
import { MarketplaceServerConfig } from '../../services/marketplace/MarketplaceManager';

export class McpSettingsView {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private mcpService: McpService
    ) {}

    /**
     * Create or show the settings view
     */
    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            // Refresh data when showing existing panel
            this.refreshSettings();
            return;
        }

        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'mcpSettings',
            'MCP Server Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Load initial data
        this.refreshSettings();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.refreshSettings();
                        break;
                    case 'install':
                        await this.handleInstallServer(message.serverId);
                        break;
                    case 'uninstall':
                        await this.handleUninstallServer(message.serverId);
                        break;
                    case 'reconnect':
                        await this.handleReconnectServer(message.serverId);
                        break;
                }
            },
            undefined,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.disposables.forEach(d => d.dispose());
                this.disposables = [];
            },
            undefined,
            this.disposables
        );

        // Add event listeners for MCP service updates
        this.mcpService.addEventListener((event) => {
            if (event.type === 'server-connected' || 
                event.type === 'server-disconnected' || 
                event.type === 'server-error' ||
                event.type === 'marketplace-updated') {
                this.refreshSettings();
            }
        });
    }

    /**
     * Get HTML content for the webview
     */
    private getWebviewContent(): string {
        const scriptUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'ui', 'MCP-Settings', 'mcp_settings.js')
        );
        const styleUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'src', 'ui', 'MCP-Settings', 'mcp_settings.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Server Settings</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="mcp-settings-container">
        <header class="header">
            <h1>MCP Server Settings</h1>
            <div class="controls">
                <button id="refresh-btn" class="btn">Refresh</button>
                <input type="text" id="search-input" placeholder="Search servers...">
            </div>
        </header>
        
        <div class="tabs">
            <div id="configured-tab" class="tab active">Configured Servers</div>
            <div id="marketplace-tab" class="tab">Marketplace</div>
        </div>

        <div id="configured-content" class="tab-content active">
            <div class="server-grid"></div>
        </div>

        <div id="marketplace-content" class="tab-content">
            <div class="server-grid"></div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Refresh settings data
     */
    private async refreshSettings() {
        try {
            // Send loading state
            this.panel?.webview.postMessage({
                type: 'loading-start'
            });

            // Get all available MCP servers
            const availableServers = await this.mcpService.getAvailableMcpServers();

            // Transform data for the view
            const configuredServers = availableServers.configuredServers.map(server => ({
                name: server.name,
                config: server.config,
                state: server.state
            }));

            const marketplaceServers = availableServers.marketplaceServers;

            // Send update to webview
            this.panel?.webview.postMessage({
                type: 'settings-update',
                servers: {
                    configured: configuredServers,
                    marketplace: marketplaceServers,
                    all: availableServers.allServers
                }
            });

        } catch (error) {
            console.error('[McpSettingsView] Failed to refresh settings:', error);
            this.panel?.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        } finally {
            // Send loading complete
            this.panel?.webview.postMessage({
                type: 'loading-complete'
            });
        }
    }

    /**
     * Handle server installation
     */
    private async handleInstallServer(serverId: string) {
        try {
            const success = await this.mcpService.installMarketplaceServer(serverId);
            if (success) {
                this.panel?.webview.postMessage({
                    type: 'install-success',
                    serverId
                });
                vscode.window.showInformationMessage(`Successfully installed ${serverId}`);
            } else {
                this.panel?.webview.postMessage({
                    type: 'install-error',
                    serverId,
                    message: `Failed to install ${serverId}`
                });
            }
        } catch (error) {
            console.error(`[McpSettingsView] Failed to install ${serverId}:`, error);
            this.panel?.webview.postMessage({
                type: 'install-error',
                serverId,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Handle server uninstallation
     */
    private async handleUninstallServer(serverId: string) {
        try {
            const success = await this.mcpService.uninstallMarketplaceServer(serverId);
            if (success) {
                this.panel?.webview.postMessage({
                    type: 'uninstall-success',
                    serverId
                });
                vscode.window.showInformationMessage(`Successfully uninstalled ${serverId}`);
            } else {
                this.panel?.webview.postMessage({
                    type: 'uninstall-error',
                    serverId,
                    message: `Failed to uninstall ${serverId}`
                });
            }
        } catch (error) {
            console.error(`[McpSettingsView] Failed to uninstall ${serverId}:`, error);
            this.panel?.webview.postMessage({
                type: 'uninstall-error',
                serverId,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Handle server reconnection
     */
    private async handleReconnectServer(serverId: string) {
        try {
            await this.mcpService.reconnectServer(serverId);
            vscode.window.showInformationMessage(`Reconnecting to ${serverId}...`);
        } catch (error) {
            console.error(`[McpSettingsView] Failed to reconnect ${serverId}:`, error);
            vscode.window.showErrorMessage(`Failed to reconnect ${serverId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Dispose the settings view
     */
    public dispose() {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }

    /**
     * Register settings command
     */
    public static registerCommand(
        context: vscode.ExtensionContext,
        mcpService: McpService
    ): vscode.Disposable {
        return vscode.commands.registerCommand('vibey.showMcpSettings', () => {
            const settingsView = new McpSettingsView(context, mcpService);
            settingsView.show();
        });
    }
}