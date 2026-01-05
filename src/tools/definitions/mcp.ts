/**
 * MCP Server Management Tools
 * Provides tools for querying and managing MCP server status
 */

import { z } from 'zod';
import { ToolDefinition } from '../schema';
import { McpService } from '../../agent/mcp/mcp_service';

export function createMcpTools(mcpService: McpService): ToolDefinition[] {
    return [
        {
            name: 'get_mcp_servers',
            description: 'Get information about available MCP servers, their connection status, and registered tools. Use this to check what MCP servers are available to you.',
            parameters: z.object({
                serverName: z.string().optional().describe('Optional: Get details for a specific server by name')
            }),
            execute: async (params: { serverName?: string }) => {
                const serverStates = mcpService.getServerStates();
                
                if (serverStates.length === 0) {
                    return JSON.stringify({
                        message: 'No MCP servers configured or available',
                        servers: []
                    }, null, 2);
                }

                // If specific server requested
                if (params.serverName) {
                    const server = serverStates.find(s => s.name === params.serverName);
                    if (!server) {
                        return JSON.stringify({
                            error: `Server '${params.serverName}' not found`,
                            availableServers: serverStates.map(s => s.name)
                        }, null, 2);
                    }
                    
                    return JSON.stringify({
                        server: {
                            name: server.name,
                            status: server.status,
                            toolCount: server.toolCount,
                            resourceCount: server.resourceCount,
                            promptCount: server.promptCount,
                            registeredTools: server.registeredTools,
                            error: server.error,
                            connectedAt: server.connectedAt ? new Date(server.connectedAt).toISOString() : undefined
                        }
                    }, null, 2);
                }

                // Return all servers
                const summary = {
                    totalServers: serverStates.length,
                    connectedServers: serverStates.filter(s => s.status === 'connected').length,
                    connectingServers: serverStates.filter(s => s.status === 'connecting').length,
                    errorServers: serverStates.filter(s => s.status === 'error').length,
                    servers: serverStates.map(s => ({
                        name: s.name,
                        status: s.status,
                        toolCount: s.toolCount,
                        resourceCount: s.resourceCount,
                        promptCount: s.promptCount,
                        registeredTools: s.registeredTools,
                        error: s.error
                    }))
                };

                return JSON.stringify(summary, null, 2);
            }
        },
        {
            name: 'list_mcp_tools',
            description: 'List all tools registered from MCP servers. Optionally filter by server name.',
            parameters: z.object({
                serverName: z.string().optional().describe('Optional: Filter tools by server name')
            }),
            execute: async (params: { serverName?: string }) => {
                const serverStates = mcpService.getServerStates();
                
                if (params.serverName) {
                    const server = serverStates.find(s => s.name === params.serverName);
                    if (!server) {
                        return JSON.stringify({
                            error: `Server '${params.serverName}' not found`,
                            availableServers: serverStates.map(s => s.name)
                        }, null, 2);
                    }
                    
                    return JSON.stringify({
                        server: params.serverName,
                        toolCount: server.toolCount,
                        tools: server.registeredTools
                    }, null, 2);
                }

                // Return all tools from all servers
                const toolsByServer = serverStates.map(s => ({
                    server: s.name,
                    status: s.status,
                    toolCount: s.toolCount,
                    tools: s.registeredTools
                }));

                return JSON.stringify({
                    totalServers: serverStates.length,
                    toolsByServer
                }, null, 2);
            }
        },
        {
            name: 'get_mcp_resources',
            description: 'Get resources available from MCP servers. Resources are data sources that servers expose.',
            parameters: z.object({
                serverName: z.string().optional().describe('Optional: Filter resources by server name')
            }),
            execute: async (params: { serverName?: string }) => {
                const resources = mcpService.getResources(params.serverName);
                
                if (resources.length === 0) {
                    return JSON.stringify({
                        message: params.serverName 
                            ? `No resources available from server '${params.serverName}'`
                            : 'No resources available from any MCP server',
                        resources: []
                    }, null, 2);
                }

                return JSON.stringify({
                    resourceCount: resources.length,
                    resources: resources.map(r => ({
                        uri: r.uri,
                        name: r.name,
                        description: r.description,
                        mimeType: r.mimeType
                    }))
                }, null, 2);
            }
        },
        {
            name: 'get_mcp_prompts',
            description: 'Get prompts available from MCP servers. Prompts are pre-defined templates that servers expose.',
            parameters: z.object({
                serverName: z.string().optional().describe('Optional: Filter prompts by server name')
            }),
            execute: async (params: { serverName?: string }) => {
                const prompts = mcpService.getPrompts(params.serverName);
                
                if (prompts.length === 0) {
                    return JSON.stringify({
                        message: params.serverName 
                            ? `No prompts available from server '${params.serverName}'`
                            : 'No prompts available from any MCP server',
                        prompts: []
                    }, null, 2);
                }

                return JSON.stringify({
                    promptCount: prompts.length,
                    prompts: prompts.map(p => ({
                        name: p.name,
                        description: p.description,
                        arguments: p.arguments
                    }))
                }, null, 2);
            }
        }
    ];
}
