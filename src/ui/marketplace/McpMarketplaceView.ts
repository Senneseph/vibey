/**
 * MCP Marketplace View - UI component for browsing and managing MCP servers
 */

import * as vscode from 'vscode';
import { McpService } from '../../agent/mcp/mcp_service';
import { MarketplaceServerConfig } from '../../services/marketplace/MarketplaceManager';

export class McpMarketplaceView {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private mcpService: McpService
    ) {}

    /**
     * Create or show the marketplace view
     */
    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            // Refresh data when showing existing panel
            this.refreshMarketplace();
            return;
        }

        // Create webview panel
        this.panel = vscode.window.createWebviewPanel(
            'mcpMarketplace',
            'MCP Marketplace',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Load initial data
        this.refreshMarketplace();

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.refreshMarketplace();
                        break;
                    case 'install':
                        await this.handleInstallServer(message.serverId);
                        break;
                    case 'uninstall':
                        await this.handleUninstallServer(message.serverId);
                        break;
                    case 'search':
                        await this.handleSearch(message.query);
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
            if (event.type === 'marketplace-updated' || event.type === 'server-connected' || event.type === 'server-disconnected') {
                this.refreshMarketplace();
            }
        });
    }

    /**
     * Get HTML content for the webview
     */
    private getWebviewContent(): string {
        const scriptUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'marketplace.js')
        );
        const styleUri = this.panel?.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'marketplace.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Marketplace</title>
    <link href="${styleUri}" rel="stylesheet">
</head>
<body>
    <div class="marketplace-container">
        <header>
            <h1>MCP Marketplace</h1>
            <div class="controls">
                <button id="refresh-btn">Refresh</button>
                <input type="text" id="search-input" placeholder="Search servers...">
            </div>
        </header>
        <main>
            <div class="server-list" id="server-list">
                <div class="loading">Loading marketplace servers...</div>
            </div>
        </main>
        <footer>
            <p>MCP Marketplace - Discover and install MCP servers</p>
        </footer>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Refresh marketplace data
     */
    private async refreshMarketplace() {
        try {
            // Send loading state
            this.panel?.webview.postMessage({
                type: 'loading-start'
            });
            
            const servers = await this.mcpService.getMarketplaceServers();
            const serverStates = this.mcpService.getServerStates();
             
            // Get installed server IDs
            const installedServerIds = serverStates.map(state => state.name);
             
            // Send update to webview
            this.panel?.webview.postMessage({
                type: 'marketplace-update',
                servers,
                installedServerIds
            });
             
        } catch (error) {
            console.error('[MarketplaceView] Failed to refresh marketplace:', error);
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
            console.error(`[MarketplaceView] Failed to install ${serverId}:`, error);
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
            console.error(`[MarketplaceView] Failed to uninstall ${serverId}:`, error);
            this.panel?.webview.postMessage({
                type: 'uninstall-error',
                serverId,
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Handle search
     */
    private async handleSearch(query: string) {
        try {
            const servers = await this.mcpService.getMarketplaceServers();
            const serverStates = this.mcpService.getServerStates();
            const installedServerIds = serverStates.map(state => state.name);
            
            // Filter servers by search query
            const filteredServers = servers.filter(server => 
                server.name.toLowerCase().includes(query.toLowerCase()) ||
                server.description.toLowerCase().includes(query.toLowerCase()) ||
                server.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
            );
            
            this.panel?.webview.postMessage({
                type: 'search-results',
                servers: filteredServers,
                installedServerIds
            });
            
        } catch (error) {
            console.error('[MarketplaceView] Failed to search marketplace:', error);
            this.panel?.webview.postMessage({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    /**
     * Dispose the marketplace view
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
     * Register marketplace command
     */
    public static registerCommand(
        context: vscode.ExtensionContext,
        mcpService: McpService
    ): vscode.Disposable {
        return vscode.commands.registerCommand('vibey.showMcpMarketplace', () => {
            const marketplaceView = new McpMarketplaceView(context, mcpService);
            marketplaceView.show();
        });
    }
}