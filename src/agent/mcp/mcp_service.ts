/**
 * MCP Service - Manages connections to MCP (Model Context Protocol) servers
 * Discovers and registers tools, resources, and prompts from external MCP servers
 */

import * as vscode from 'vscode';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ToolGateway } from '../../tools/gateway';
import { ToolDefinition } from '../../tools/schema';
import {
    McpServerConfig,
    McpServerState,
    McpResource,
    McpPrompt,
    McpEvent,
    McpEventListener,
    jsonSchemaToZod
} from './types';
import { MarketplaceManager, MarketplaceServerConfig } from '../../services/marketplace/MarketplaceManager';
import { RemoteConfigLoader } from '../../services/marketplace/RemoteConfigLoader';

export class McpService {
    private clients: Map<string, Client> = new Map();
    private serverStates: Map<string, McpServerState> = new Map();
    private resources: Map<string, McpResource[]> = new Map();
    private prompts: Map<string, McpPrompt[]> = new Map();
    private disposables: vscode.Disposable[] = [];
    private eventListeners: McpEventListener[] = [];
    private marketplaceManager: MarketplaceManager;
    private remoteConfigLoader: RemoteConfigLoader;
    private marketplaceServers: MarketplaceServerConfig[] = [];

    constructor(
        private gateway: ToolGateway,
        private context: vscode.ExtensionContext
    ) {
        this.marketplaceManager = new MarketplaceManager();
        this.remoteConfigLoader = new RemoteConfigLoader();
        
        // Watch for config changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('vibey.mcpServers') ||
                    e.affectsConfiguration('vibey.mcpMarketplaceEnabled')) {
                    this.reloadServers();
                }
            })
        );
    }

    /**
     * Get the built-in OpenSpec server configuration
     */
    private getBuiltInOpenSpecServerConfig(): McpServerConfig {
        const openspecServerPath = this.context.asAbsolutePath('openspec-server/build/index.js');

        // Filter out undefined values from process.env
        const env: Record<string, string> = {
            NODE_ENV: 'production'
        };

        for (const key in process.env) {
            if (process.env[key]) {
                env[key] = process.env[key] as string;
            }
        }

        return {
            command: process.execPath, // Use the current Node.js executable
            args: [openspecServerPath],
            env,
            timeout: 10000,
            autoReconnect: true
        };
    }

    /**
     * Get the built-in filesystem server configuration for testing
     */
    private getBuiltInFilesystemServerConfig(): McpServerConfig {
        const filesystemServerPath = this.context.asAbsolutePath('src/agent/mcp/filesystem_mcp_server.js');

        // Get workspace root - try to get from workspace folders, fall back to cwd
        const workspaceRoot = vscode.workspace.workspaceFolders?.
            [0]?.uri?.fsPath || process.cwd();

        // Filter out undefined values from process.env
        const env: Record<string, string> = {
            NODE_ENV: 'production',
            VIBEY_WORKSPACE_ROOT: workspaceRoot
        };

        for (const key in process.env) {
            if (process.env[key]) {
                env[key] = process.env[key] as string;
            }
        }

        return {
            command: process.execPath, // Use the current Node.js executable
            args: [filesystemServerPath],
            env,
            timeout: 10000,
            autoReconnect: true
        };
    }

    /**
     * Get context7 server configuration
     */
    private getContext7ServerConfig(): McpServerConfig {
        // Filter out undefined values from process.env
        const env: Record<string, string> = {
            CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || ''
        };
        
        // Add other environment variables that are defined
        for (const key in process.env) {
            if (process.env[key]) {
                env[key] = process.env[key] as string;
            }
        }
        
        return {
            command: 'context7-server',
            args: ['--mcp-mode'],
            env,
            timeout: 15000,
            autoReconnect: true
        };
    }

    /**
     * Get sequentialthinking server configuration
     */
    private getSequentialThinkingServerConfig(): McpServerConfig {
        // Filter out undefined values from process.env
        const env: Record<string, string> = {};
        
        for (const key in process.env) {
            if (process.env[key]) {
                env[key] = process.env[key] as string;
            }
        }
        
        return {
            command: 'sequentialthinking-server',
            args: ['--mcp-mode'],
            env,
            timeout: 10000,
            autoReconnect: true
        };
    }

    /**
     * Get memory server configuration
     */
    private getMemoryServerConfig(): McpServerConfig {
        // Get workspace root for memory bank storage
        const workspaceRoot = vscode.workspace.workspaceFolders?.
            [0]?.uri?.fsPath || process.cwd();
        const memoryBankPath = this.context.asAbsolutePath('.kilocode/rules/memory-bank/');
        
        // Filter out undefined values from process.env
        const env: Record<string, string> = {
            MEMORY_BANK_DIR: memoryBankPath
        };
        
        for (const key in process.env) {
            if (process.env[key]) {
                env[key] = process.env[key] as string;
            }
        }
        
        return {
            command: 'memory-server',
            args: ['--mcp-mode', '--memory-dir', memoryBankPath],
            env,
            timeout: 10000,
            autoReconnect: true
        };
    }

    /** Initialize and connect to configured servers */
    public async initialize(): Promise<void> {
        console.log('[MCP] ========================================');
        console.log('[MCP] Initializing MCP Service...');
        console.log('[MCP] ========================================');

        try {
            // Clear any stale data from previous initialization
            console.log('[MCP] Step 1: Cleaning up stale servers...');
            await this.cleanupStaleServers();
            console.log('[MCP] Step 1: Complete');

            // Load marketplace servers if enabled
            console.log('[MCP] Step 2: Loading marketplace servers...');
            await this.loadMarketplaceServers();
            console.log('[MCP] Step 2: Complete');

            // Load and connect to servers
            console.log('[MCP] Step 3: Reloading servers...');
            await this.reloadServers();
            console.log('[MCP] Step 3: Complete');

            // Log final state
            const finalStates = this.getServerStates();
            console.log('[MCP] ========================================');
            console.log('[MCP] Initialization complete. Server states:', JSON.stringify(finalStates, null, 2));
            console.log('[MCP] ========================================');

            if (finalStates.length === 0) {
                console.error('[MCP] ❌ CRITICAL: No servers available after initialization!');
                console.error('[MCP] This indicates a problem in reloadServers()');
            } else {
                const connected = finalStates.filter(s => s.status === 'connected');
                const errors = finalStates.filter(s => s.status === 'error');
                const connecting = finalStates.filter(s => s.status === 'connecting');

                console.log(`[MCP] ✅ Total servers: ${finalStates.length}`);
                console.log(`[MCP]    - Connected: ${connected.length}`);
                console.log(`[MCP]    - Connecting: ${connecting.length}`);
                console.log(`[MCP]    - Errors: ${errors.length}`);

                if (errors.length > 0) {
                    console.error(`[MCP] ${errors.length} server(s) failed to connect:`);
                    errors.forEach(error => {
                        console.error(`[MCP]    - ${error.name}: ${error.error}`);
                    });
                }
            }
        } catch (error: any) {
            console.error('[MCP] ❌ FATAL ERROR during initialization:', error);
            console.error('[MCP] Error stack:', error.stack);
            throw error;
        }
    }

    /** Load marketplace servers if marketplace is enabled */
    private async loadMarketplaceServers(): Promise<void> {
        const config = vscode.workspace.getConfiguration('vibey');
        const marketplaceEnabled = config.get<boolean>('mcpMarketplaceEnabled', true);
        
        if (!marketplaceEnabled) {
            console.log('[MCP] Marketplace integration is disabled');
            return;
        }
        
        try {
            console.log('[MCP] Loading marketplace servers...');
            this.marketplaceServers = await this.marketplaceManager.loadMarketplaceServers();
            console.log(`[MCP] Loaded ${this.marketplaceServers.length} marketplace servers`);
            
            // Emit event for marketplace update
            this.emitEvent({
                type: 'marketplace-updated',
                serverName: 'marketplace',
                data: { count: this.marketplaceServers.length }
            });
            
        } catch (error) {
            console.error('[MCP] Failed to load marketplace servers:', error);
            this.emitEvent({
                type: 'marketplace-error',
                serverName: 'marketplace',
                data: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
        }
    }

    /** Clean up stale server states and connections */
    private async cleanupStaleServers(): Promise<void> {
        console.log('[MCP] Cleaning up stale server data...');
        
        // Disconnect all existing servers
        for (const name of this.clients.keys()) {
            try {
                await this.disconnectServer(name);
            } catch (e) {
                console.warn(`[MCP] Error cleaning up server ${name}:`, e);
            }
        }
        
        // Clear all state
        this.serverStates.clear();
        this.resources.clear();
        this.prompts.clear();
    }

    /** Add an event listener */
    public addEventListener(listener: McpEventListener): void {
        this.eventListeners.push(listener);
    }

    /** Remove an event listener */
    public removeEventListener(listener: McpEventListener): void {
        const idx = this.eventListeners.indexOf(listener);
        if (idx >= 0) {
            this.eventListeners.splice(idx, 1);
        }
    }

    private emitEvent(event: McpEvent): void {
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[MCP] Event listener error:', e);
            }
        }
    }

    /** Get all server states */
    public getServerStates(): McpServerState[] {
        return Array.from(this.serverStates.values());
    }

    /** Get server state by name */
    public getServerState(name: string): McpServerState | undefined {
        return this.serverStates.get(name);
    }

    /** Get resources from a specific server */
    public getResources(serverName?: string): McpResource[] {
        if (serverName) {
            return this.resources.get(serverName) || [];
        }
        return Array.from(this.resources.values()).flat();
    }

    /** Get prompts from a specific server */
    public getPrompts(serverName?: string): McpPrompt[] {
        if (serverName) {
            return this.prompts.get(serverName) || [];
        }
        return Array.from(this.prompts.values()).flat();
    }

    /** Read a resource by URI */
    public async readResource(uri: string): Promise<string> {
        // Find which server has this resource
        for (const [serverName, resources] of this.resources.entries()) {
            const resource = resources.find(r => r.uri === uri);
            if (resource) {
                const client = this.clients.get(serverName);
                if (!client) {
                    throw new Error(`Server ${serverName} not connected`);
                }
                const result = await client.readResource({ uri });
                if (result.contents && result.contents.length > 0) {
                    const content = result.contents[0];
                    if ('text' in content) {
                        return content.text as string;
                    }
                    return JSON.stringify(content);
                }
                return '';
            }
        }
        throw new Error(`Resource not found: ${uri}`);
    }

    /** Get a prompt with arguments filled in */
    public async getPrompt(name: string, args?: Record<string, string>): Promise<string> {
        for (const [serverName, prompts] of this.prompts.entries()) {
            const prompt = prompts.find(p => p.name === name);
            if (prompt) {
                const client = this.clients.get(serverName);
                if (!client) {
                    throw new Error(`Server ${serverName} not connected`);
                }
                const result = await client.getPrompt({ name, arguments: args });
                if (result.messages && result.messages.length > 0) {
                    return result.messages.map(m => {
                        if (typeof m.content === 'string') return m.content;
                        if (m.content && 'text' in m.content) return m.content.text;
                        return JSON.stringify(m.content);
                    }).join('\n');
                }
                return '';
            }
        }
        throw new Error(`Prompt not found: ${name}`);
    }

    public async dispose(): Promise<void> {
        this.disposables.forEach(d => d.dispose());
        for (const [name] of this.clients.entries()) {
            await this.disconnectServer(name);
        }
        this.clients.clear();
        this.serverStates.clear();
        this.resources.clear();
        this.prompts.clear();
    }

    /** Manually reconnect a server */
    public async reconnectServer(name: string): Promise<void> {
        const state = this.serverStates.get(name);
        if (!state) {
            throw new Error(`Server ${name} not configured`);
        }
        await this.disconnectServer(name);
        await this.connectToServer(name, state.config);
    }

    /** Reload all servers from configuration */
    public async reloadServers(): Promise<void> {
        console.log('[MCP] Reloading servers...');

        // Get current config
        const config = vscode.workspace.getConfiguration('vibey');
        const servers = config.get<Record<string, McpServerConfig>>('mcpServers') || {};
        const configuredNames = new Set(Object.keys(servers));

        console.log('[MCP] Initial configured servers:', Object.keys(servers));

        // Add marketplace servers if enabled
        console.log('[MCP] About to call addMarketplaceServers...');
        try {
            await this.addMarketplaceServers(servers, configuredNames);
            console.log('[MCP] addMarketplaceServers completed successfully');
        } catch (error) {
            console.error('[MCP] CRITICAL: addMarketplaceServers threw an error:', error);
        }
        console.log('[MCP] After marketplace servers:', Object.keys(servers));

        // Always add built-in filesystem server unless explicitly disabled
        const filesystemServerName = 'filesystem-builtin';
        const disableFilesystem = config.get<boolean>('disableFilesystemServer', false);
        console.log(`[MCP] Filesystem server - disabled: ${disableFilesystem}, already configured: ${configuredNames.has(filesystemServerName)}`);
        if (!disableFilesystem && !configuredNames.has(filesystemServerName)) {
            servers[filesystemServerName] = this.getBuiltInFilesystemServerConfig();
            console.log(`[MCP] Added built-in filesystem server`);
        }

        // Always add built-in OpenSpec server unless explicitly disabled
        const builtInServerName = 'openspec-builtin';
        const disableOpenSpec = config.get<boolean>('disableOpenSpecServer', false);
        console.log(`[MCP] OpenSpec server - disabled: ${disableOpenSpec}, already configured: ${configuredNames.has(builtInServerName)}`);
        if (!disableOpenSpec && !configuredNames.has(builtInServerName)) {
            servers[builtInServerName] = this.getBuiltInOpenSpecServerConfig();
            console.log(`[MCP] Added built-in OpenSpec server`);
        }

        console.log('[MCP] Final server list to load:', Object.keys(servers));
        console.log('[MCP] Final server configurations:', JSON.stringify(servers, null, 2));

        // PRE-POPULATE server states BEFORE attempting connections
        // This ensures tests can see configured servers immediately, even if connections are pending
        for (const [name, serverConfig] of Object.entries(servers)) {
            const existingState = this.serverStates.get(name);
            if (!existingState) {
                // Create initial state for new servers
                this.updateServerState(name, {
                    name,
                    config: serverConfig,
                    status: 'connecting',
                    toolCount: 0,
                    resourceCount: 0,
                    promptCount: 0,
                    registeredTools: []
                });
                console.log(`[MCP] Pre-registered server state for: ${name}`);
            }
        }

        // Disconnect servers that are no longer configured
        for (const name of this.clients.keys()) {
            if (!configuredNames.has(name) && name !== builtInServerName && name !== filesystemServerName) {
                await this.disconnectServer(name);
            }
        }

        // Special handling for built-in servers that should always be connected
        const alwaysOnServers = new Set([builtInServerName, filesystemServerName]);
        for (const name of alwaysOnServers) {
            if (!configuredNames.has(name) && !servers[name]) {
                // This server should be connected but isn't in the config
                // Disconnect it if it exists
                if (this.clients.has(name)) {
                    await this.disconnectServer(name);
                }
            }
        }

        // Connect new/updated servers
        for (const [name, serverConfig] of Object.entries(servers)) {
            const existingState = this.serverStates.get(name);
            const configChanged = existingState &&
                JSON.stringify(existingState.config) !== JSON.stringify(serverConfig);

            if (!existingState || configChanged) {
                if (existingState && configChanged) {
                    await this.disconnectServer(name);
                }
                try {
                    await this.connectToServer(name, serverConfig);
                } catch (e: any) {
                    console.error(`[MCP] Error connecting to ${name}:`, e);
                    this.updateServerState(name, {
                        name,
                        config: serverConfig,
                        status: 'error',
                        error: e.message,
                        toolCount: 0,
                        resourceCount: 0,
                        promptCount: 0,
                        registeredTools: []
                    });
                }
            }
        }
    }

    /** Add marketplace servers to the configuration if marketplace is enabled */
    private async addMarketplaceServers(
        servers: Record<string, McpServerConfig>,
        configuredNames: Set<string>
    ): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('vibey');
            const marketplaceEnabled = config.get<boolean>('mcpMarketplaceEnabled', true);

            if (!marketplaceEnabled) {
                console.log('[MCP] Marketplace is disabled');
                return;
            }

            // Use cached marketplace servers (already loaded in initialize())
            console.log(`[MCP] Using ${this.marketplaceServers.length} cached marketplace servers`);

            // Debug: Log initial state
            console.log(`[MCP] DEBUG: Initial servers: ${JSON.stringify(Object.keys(servers))}`);
            console.log(`[MCP] DEBUG: Initial configuredNames: ${JSON.stringify(Array.from(configuredNames))}`);
            console.log(`[MCP] DEBUG: Marketplace servers to add: ${this.marketplaceServers.length}`);

            let marketplaceServersAdded = false;

            // Add marketplace servers that aren't already configured
            for (const marketplaceServer of this.marketplaceServers) {
                console.log(`[MCP] DEBUG: Processing marketplace server: ${marketplaceServer.id}`);
                console.log(`[MCP] DEBUG: Already configured? ${configuredNames.has(marketplaceServer.id)}`);
                
                if (!configuredNames.has(marketplaceServer.id)) {
                    // Use built-in configurations for known servers if available
                    let serverConfig: McpServerConfig;
                    switch (marketplaceServer.id) {
                        case 'context7':
                            serverConfig = this.getContext7ServerConfig();
                            break;
                        case 'sequentialthinking':
                            serverConfig = this.getSequentialThinkingServerConfig();
                            break;
                        case 'memory':
                            serverConfig = this.getMemoryServerConfig();
                            break;
                        default:
                            serverConfig = marketplaceServer.config;
                    }
                    
                    console.log(`[MCP] DEBUG: Adding server ${marketplaceServer.id} with config:`, serverConfig);
                    servers[marketplaceServer.id] = serverConfig;
                    configuredNames.add(marketplaceServer.id);
                    marketplaceServersAdded = true;
                    console.log(`[MCP] Added marketplace server: ${marketplaceServer.id}`);
                    
                    // Debug: Verify the server was added
                    console.log(`[MCP] DEBUG: Server ${marketplaceServer.id} added? ${marketplaceServer.id in servers}`);
                    console.log(`[MCP] DEBUG: Current servers: ${JSON.stringify(Object.keys(servers))}`);
                }
            }
            
            // If we added marketplace servers, persist them to the configuration
            if (marketplaceServersAdded) {
                console.log(`[MCP] Persisting ${Object.keys(servers).length} servers to configuration`);
                await config.update('mcpServers', servers, vscode.ConfigurationTarget.Global);
                console.log(`[MCP] Successfully updated MCP servers configuration`);
            }
            
            // Debug: Log the current state of servers after adding marketplace servers
            console.log(`[MCP] Servers after adding marketplace: ${JSON.stringify(Object.keys(servers))}`);
            console.log(`[MCP] Configured names after adding marketplace: ${JSON.stringify(Array.from(configuredNames))}`);
            console.log(`[MCP] DEBUG: Full servers object:`, JSON.stringify(servers, null, 2));
        } catch (error) {
            console.error('[MCP] Error adding marketplace servers (continuing with built-in servers):', error);
            // Don't throw - we want to continue with built-in servers even if marketplace fails
        }
    }

    /** Get available marketplace servers */
    public async getMarketplaceServers(): Promise<MarketplaceServerConfig[]> {
        return this.marketplaceManager.getCachedServers();
    }

    /** Install a marketplace server by ID */
    public async installMarketplaceServer(serverId: string): Promise<boolean> {
        try {
            const server = await this.marketplaceManager.getServerById(serverId);
            if (!server) {
                console.error(`[MCP] Marketplace server ${serverId} not found`);
                return false;
            }
            
            // Add to configuration
            const config = vscode.workspace.getConfiguration('vibey');
            const servers = config.get<Record<string, McpServerConfig>>('mcpServers') || {};
            servers[serverId] = server.config;
            
            await config.update('mcpServers', servers, vscode.ConfigurationTarget.Global);
            
            // Reload servers to connect to the new one
            await this.reloadServers();
            
            return true;
        } catch (error) {
            console.error(`[MCP] Failed to install marketplace server ${serverId}:`, error);
            return false;
        }
    }

    /** Uninstall a marketplace server by ID */
    public async uninstallMarketplaceServer(serverId: string): Promise<boolean> {
        try {
            // Remove from configuration
            const config = vscode.workspace.getConfiguration('vibey');
            const servers = config.get<Record<string, McpServerConfig>>('mcpServers') || {};
            
            if (servers[serverId]) {
                delete servers[serverId];
                await config.update('mcpServers', servers, vscode.ConfigurationTarget.Global);
                
                // Disconnect the server
                await this.disconnectServer(serverId);
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`[MCP] Failed to uninstall marketplace server ${serverId}:`, error);
            return false;
        }
    }

    /** Refresh marketplace data */
    public async refreshMarketplace(): Promise<void> {
        console.log('[MCP] Refreshing marketplace data...');
        this.marketplaceManager.clearCache();
        await this.loadMarketplaceServers();
        await this.reloadServers();
    }


    private updateServerState(name: string, state: McpServerState): void {
        this.serverStates.set(name, state);
    }

    private async disconnectServer(name: string): Promise<void> {
        const state = this.serverStates.get(name);
        const client = this.clients.get(name);

        // Unregister tools from this server
        if (state) {
            for (const toolName of state.registeredTools) {
                this.gateway.unregisterTool(toolName);
            }
        }

        // Close client connection
        if (client) {
            try {
                await client.close();
            } catch (e) {
                console.error(`[MCP] Error closing client ${name}:`, e);
            }
            this.clients.delete(name);
        }

        // Clear state
        this.serverStates.delete(name);
        this.resources.delete(name);
        this.prompts.delete(name);

        this.emitEvent({ type: 'server-disconnected', serverName: name });
        console.log(`[MCP] Disconnected from ${name}`);
    }

    private async connectToServer(name: string, config: McpServerConfig): Promise<void> {
        console.log(`[MCP] Connecting to ${name}...`, config);

        // Update state to connecting
        this.updateServerState(name, {
            name,
            config,
            status: 'connecting',
            toolCount: 0,
            resourceCount: 0,
            promptCount: 0,
            registeredTools: []
        });

        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: config.env
            });

            const client = new Client({
                name: "VibeyClient",
                version: "0.1.3",
            }, {
                capabilities: {
                    sampling: {},
                },
            });

            await client.connect(transport);
            this.clients.set(name, client);

            // Discover tools, resources, and prompts
            const registeredTools: string[] = [];
            let toolCount = 0;
            let resourceCount = 0;
            let promptCount = 0;

            // Fetch and register tools
            try {
                const toolsResult = await client.listTools();
                if (toolsResult.tools) {
                    for (const tool of toolsResult.tools) {
                        const vibeyTool = this.adaptMcpTool(name, client, tool);
                        this.gateway.registerTool(vibeyTool);
                        registeredTools.push(tool.name);
                        toolCount++;
                        console.log(`[MCP] Registered tool: ${tool.name} from ${name}`);
                    }
                }
            } catch (e) {
                console.warn(`[MCP] Failed to list tools from ${name}:`, e);
            }

            // Fetch resources
            try {
                const resourcesResult = await client.listResources();
                if (resourcesResult.resources) {
                    const serverResources: McpResource[] = resourcesResult.resources.map(r => ({
                        uri: r.uri,
                        name: r.name,
                        description: r.description,
                        mimeType: r.mimeType
                    }));
                    this.resources.set(name, serverResources);
                    resourceCount = serverResources.length;
                    console.log(`[MCP] Discovered ${resourceCount} resources from ${name}`);
                }
            } catch (e) {
                // Resources are optional, server might not support them
                console.log(`[MCP] Server ${name} does not support resources`);
            }

            // Fetch prompts
            try {
                const promptsResult = await client.listPrompts();
                if (promptsResult.prompts) {
                    const serverPrompts: McpPrompt[] = promptsResult.prompts.map(p => ({
                        name: p.name,
                        description: p.description,
                        arguments: p.arguments?.map(a => ({
                            name: a.name,
                            description: a.description,
                            required: a.required
                        }))
                    }));
                    this.prompts.set(name, serverPrompts);
                    promptCount = serverPrompts.length;
                    console.log(`[MCP] Discovered ${promptCount} prompts from ${name}`);
                }
            } catch (e) {
                // Prompts are optional
                console.log(`[MCP] Server ${name} does not support prompts`);
            }

            // Update state to connected
            this.updateServerState(name, {
                name,
                config,
                status: 'connected',
                connectedAt: Date.now(),
                toolCount,
                resourceCount,
                promptCount,
                registeredTools
            });

            this.emitEvent({ type: 'server-connected', serverName: name });
            this.emitEvent({ type: 'tools-updated', serverName: name, data: { count: toolCount } });

            vscode.window.showInformationMessage(
                `MCP: Connected to ${name} (${toolCount} tools, ${resourceCount} resources)`
            );

        } catch (e: any) {
            console.error(`[MCP] Failed to connect to ${name}:`, e);
            this.updateServerState(name, {
                name,
                config,
                status: 'error',
                error: e.message,
                toolCount: 0,
                resourceCount: 0,
                promptCount: 0,
                registeredTools: []
            });
            this.emitEvent({ type: 'server-error', serverName: name, data: { error: e.message } });
            vscode.window.showErrorMessage(`MCP: Failed to connect to ${name}: ${e.message}`);
            throw e;
        }
    }

    private adaptMcpTool(serverName: string, client: Client, tool: any): ToolDefinition {
        return {
            name: tool.name,
            description: tool.description || `Tool from MCP server: ${serverName}`,
            parameters: jsonSchemaToZod(tool.inputSchema),
            execute: async (params: any) => {
                const callResult = await client.callTool({
                    name: tool.name,
                    arguments: params
                });

                // Handle isError flag
                if (callResult.isError) {
                    const errorMsg = this.extractContent(callResult.content);
                    throw new Error(errorMsg || 'Tool execution failed');
                }

                return this.extractContent(callResult.content);
            }
        };
    }

    private extractContent(content: any): string {
        if (!content) return '';
        if (Array.isArray(content)) {
            return content.map(c => {
                if (typeof c === 'string') return c;
                if (c.type === 'text') return c.text;
                if (c.type === 'image') return `[Image: ${c.mimeType || 'unknown'}]`;
                if (c.type === 'resource') return `[Resource: ${c.resource?.uri || 'unknown'}]`;
                return JSON.stringify(c);
            }).join('\n');
        }
        return JSON.stringify(content);
    }

    /**
     * Get all available MCP servers (both configured and marketplace)
     * This method returns a comprehensive view of all available MCP servers
     */
    public async getAvailableMcpServers(): Promise<{
        configuredServers: Array<{name: string; config: McpServerConfig; state?: McpServerState}>;
        marketplaceServers: MarketplaceServerConfig[];
        allServers: Array<{name: string; source: 'configured' | 'marketplace'; config: McpServerConfig; state?: McpServerState}>;
    }> {
        // Get configured servers from current state
        const configuredServers = this.getServerStates().map(state => ({
            name: state.name,
            config: state.config,
            state
        }));

        // Get marketplace servers
        const marketplaceServers = await this.getMarketplaceServers();

        // Combine all servers with source information
        const allServers: Array<{name: string; source: 'configured' | 'marketplace'; config: McpServerConfig; state?: McpServerState}> = [];

        // Add configured servers
        configuredServers.forEach(server => {
            allServers.push({
                name: server.name,
                source: 'configured',
                config: server.config,
                state: server.state
            });
        });

        // Add marketplace servers that aren't already configured
        marketplaceServers.forEach(marketplaceServer => {
            const alreadyConfigured = configuredServers.some(s => s.name === marketplaceServer.id);
            if (!alreadyConfigured) {
                allServers.push({
                    name: marketplaceServer.id,
                    source: 'marketplace',
                    config: marketplaceServer.config,
                    state: undefined
                });
            }
        });

        return {
            configuredServers,
            marketplaceServers,
            allServers
        };
    }
}

