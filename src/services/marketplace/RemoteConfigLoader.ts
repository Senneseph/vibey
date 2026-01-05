/**
 * Remote Configuration Loader - Handles loading MCP configurations from remote sources
 */

import * as vscode from 'vscode';
import { McpServerConfig } from '../../agent/mcp/types';

/**
 * Remote configuration source
 */
export interface RemoteConfigSource {
    url: string;
    authToken?: string;
    cacheTTL?: number;
}

/**
 * Remote configuration response
 */
export interface RemoteConfigResponse {
    servers: Record<string, McpServerConfig>;
    version: string;
    timestamp: string;
}

export class RemoteConfigLoader {
    private cache: Map<string, RemoteConfigResponse> = new Map();
    private cacheExpiry: Map<string, number> = new Map();

    constructor(private defaultCacheTTL: number = 15 * 60 * 1000) {} // 15 minutes default

    /**
     * Load configuration from a remote source
     */
    public async loadRemoteConfig(source: RemoteConfigSource): Promise<Record<string, McpServerConfig>> {
        const cacheKey = source.url;
        
        // Check cache first
        if (this.isCacheValid(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            return cached?.servers || {};
        }

        try {
            // For now, return mock data - this will be replaced with actual HTTP calls
            const mockResponse: RemoteConfigResponse = {
                servers: {
                    'context7-remote': {
                        command: 'context7-server',
                        args: ['--mcp-mode', '--remote-config'],
                        env: { 
                            CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || '',
                            CONTEXT7_CONFIG_URL: source.url 
                        },
                        timeout: 20000,
                        autoReconnect: true
                    }
                },
                version: '1.0.0',
                timestamp: new Date().toISOString()
            };

            this.cache.set(cacheKey, mockResponse);
            this.cacheExpiry.set(cacheKey, Date.now() + (source.cacheTTL || this.defaultCacheTTL));
            
            return mockResponse.servers;

        } catch (error) {
            console.error(`[RemoteConfig] Failed to load config from ${source.url}:`, error);
            // Return empty config on error
            return {};
        }
    }

    /**
     * Check if cache is valid for a specific source
     */
    private isCacheValid(cacheKey: string): boolean {
        const expiry = this.cacheExpiry.get(cacheKey);
        return expiry !== undefined && Date.now() < expiry;
    }

    /**
     * Clear cache for a specific source
     */
    public clearCache(cacheKey: string): void {
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
    }

    /**
     * Clear all cached configurations
     */
    public clearAllCache(): void {
        this.cache.clear();
        this.cacheExpiry.clear();
    }

    /**
     * Get cached configuration count
     */
    public getCacheCount(): number {
        return this.cache.size;
    }
}