/**
 * Marketplace Manager - Handles discovery and management of MCP servers from marketplace
 */

import * as vscode from 'vscode';
import { McpServerConfig } from '../../agent/mcp/types';

/**
 * Configuration for a marketplace MCP server
 */
export interface MarketplaceServerConfig {
    id: string;
    name: string;
    description: string;
    version: string;
    author: string;
    tags: string[];
    config: McpServerConfig;
    icon?: string;
    documentationUrl?: string;
}

/**
 * Marketplace API response structure
 */
export interface MarketplaceApiResponse {
    servers: MarketplaceServerConfig[];
    cacheTTL: number;
    timestamp: string;
}

export class MarketplaceManager {
    private cache: MarketplaceServerConfig[] = [];
    private cacheExpiry: number = 0;
    private isLoading: boolean = false;
    private listeners: ((servers: MarketplaceServerConfig[]) => void)[] = [];

    constructor(private cacheTTL: number = 5 * 60 * 1000) {} // 5 minutes default

    /**
     * Add a listener for marketplace updates
     */
    public addListener(listener: (servers: MarketplaceServerConfig[]) => void): void {
        this.listeners.push(listener);
    }

    /**
     * Remove a listener
     */
    public removeListener(listener: (servers: MarketplaceServerConfig[]) => void): void {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Get cached marketplace servers
     */
    public getCachedServers(): MarketplaceServerConfig[] {
        return this.cache;
    }

    /**
     * Check if cache is still valid
     */
    private isCacheValid(): boolean {
        return this.cache.length > 0 && Date.now() < this.cacheExpiry;
    }

    /**
     * Load servers from marketplace (with caching)
     */
    public async loadMarketplaceServers(): Promise<MarketplaceServerConfig[]> {
        // Return cached data if valid
        if (this.isCacheValid()) {
            return this.cache;
        }

        // Prevent multiple concurrent loads
        if (this.isLoading) {
            // Wait a bit and try again
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.loadMarketplaceServers();
        }

        try {
            this.isLoading = true;
            
            // For now, return mock data - this will be replaced with actual API calls
            const mockServers: MarketplaceServerConfig[] = [
                {
                    id: 'context7',
                    name: 'context7',
                    description: 'Context management and resolution MCP server',
                    version: '1.0.0',
                    author: 'Kilo Code',
                    tags: ['context', 'library', 'dependency'],
                    config: {
                        command: 'context7-server',
                        args: ['--mcp-mode'],
                        env: { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || '' },
                        timeout: 15000,
                        autoReconnect: true
                    }
                },
                {
                    id: 'sequentialthinking',
                    name: 'sequentialthinking',
                    description: 'Sequential task processing and reasoning MCP server',
                    version: '1.2.0',
                    author: 'Kilo Code',
                    tags: ['reasoning', 'multi-step', 'task-processing'],
                    config: {
                        command: 'sequentialthinking-server',
                        args: ['--mcp-mode'],
                        timeout: 10000,
                        autoReconnect: true
                    }
                },
                {
                    id: 'memory',
                    name: 'memory',
                    description: 'Memory bank management and persistent context storage',
                    version: '2.1.0',
                    author: 'Kilo Code',
                    tags: ['memory', 'persistence', 'context'],
                    config: {
                        command: 'memory-server',
                        args: ['--mcp-mode', '--memory-dir', '.kilocode/rules/memory-bank/'],
                        timeout: 10000,
                        autoReconnect: true
                    }
                }
            ];

            this.cache = mockServers;
            this.cacheExpiry = Date.now() + this.cacheTTL;
            
            // Notify listeners
            this.listeners.forEach(listener => {
                try {
                    listener(this.cache);
                } catch (e) {
                    console.error('[Marketplace] Listener error:', e);
                }
            });

            return this.cache;

        } catch (error) {
            console.error('[Marketplace] Failed to load marketplace servers:', error);
            // Return cached data even if stale, to maintain functionality
            return this.cache;
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Get a specific server by ID
     */
    public async getServerById(serverId: string): Promise<MarketplaceServerConfig | undefined> {
        const servers = await this.loadMarketplaceServers();
        return servers.find(server => server.id === serverId);
    }

    /**
     * Search servers by tags or name
     */
    public async searchServers(query: string): Promise<MarketplaceServerConfig[]> {
        const servers = await this.loadMarketplaceServers();
        const lowerQuery = query.toLowerCase();
        
        return servers.filter(server => 
            server.name.toLowerCase().includes(lowerQuery) ||
            server.description.toLowerCase().includes(lowerQuery) ||
            server.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Clear the cache (for testing or manual refresh)
     */
    public clearCache(): void {
        this.cache = [];
        this.cacheExpiry = 0;
    }

    /**
     * Get server count
     */
    public async getServerCount(): Promise<number> {
        const servers = await this.loadMarketplaceServers();
        return servers.length;
    }
}