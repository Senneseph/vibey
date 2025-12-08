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

export class McpService {
    private clients: Map<string, Client> = new Map();
    private serverStates: Map<string, McpServerState> = new Map();
    private resources: Map<string, McpResource[]> = new Map();
    private prompts: Map<string, McpPrompt[]> = new Map();
    private disposables: vscode.Disposable[] = [];
    private eventListeners: McpEventListener[] = [];

    constructor(
        private gateway: ToolGateway,
        private context: vscode.ExtensionContext
    ) {
        // Watch for config changes
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('vibey.mcpServers')) {
                    this.reloadServers();
                }
            })
        );
    }

    /** Initialize and connect to configured servers */
    public async initialize(): Promise<void> {
        await this.reloadServers();
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

        // Disconnect servers that are no longer configured
        for (const name of this.clients.keys()) {
            if (!configuredNames.has(name)) {
                await this.disconnectServer(name);
            }
        }

        // Connect new/updated servers
        for (const [name, serverConfig] of Object.entries(servers)) {
            const existingState = this.serverStates.get(name);
            const configChanged = existingState &&
                JSON.stringify(existingState.config) !== JSON.stringify(serverConfig);

            if (!existingState || configChanged) {
                if (existingState) {
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
}

