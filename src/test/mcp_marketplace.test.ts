/**
 * MCP Marketplace Integration Tests
 * Tests for the new MCP marketplace functionality
 */

import { MarketplaceManager, MarketplaceServerConfig } from '../services/marketplace/MarketplaceManager';
import { RemoteConfigLoader } from '../services/marketplace/RemoteConfigLoader';
import { McpService } from '../agent/mcp/mcp_service';
import { MemoryService, MemoryContext } from '../agent/mcp/memory_service';
import * as vscode from 'vscode';

describe('MCP Marketplace Integration Tests', () => {
    let marketplaceManager: MarketplaceManager;
    let remoteConfigLoader: RemoteConfigLoader;

    beforeAll(() => {
        marketplaceManager = new MarketplaceManager(1000); // 1 second cache for testing
        remoteConfigLoader = new RemoteConfigLoader(1000); // 1 second cache for testing
    });

    afterAll(() => {
        marketplaceManager = undefined as any;
        remoteConfigLoader = undefined as any;
    });

    describe('MarketplaceManager', () => {
        test('should initialize with empty cache', () => {
            expect(marketplaceManager.getCachedServers()).toEqual([]);
        });

        test('should load marketplace servers', async () => {
            const servers = await marketplaceManager.loadMarketplaceServers();
            expect(Array.isArray(servers)).toBe(true);
            expect(servers.length).toBeGreaterThan(0);
            
            // Check that we have the expected servers
            const serverIds = servers.map(s => s.id);
            expect(serverIds).toContain('context7');
            expect(serverIds).toContain('sequentialthinking');
            expect(serverIds).toContain('memory');
        });

        test('should cache marketplace servers', async () => {
            // First load
            const firstLoad = await marketplaceManager.loadMarketplaceServers();
            
            // Second load should return cached data
            const secondLoad = await marketplaceManager.loadMarketplaceServers();
            
            expect(firstLoad).toEqual(secondLoad);
        });

        test('should get server by ID', async () => {
            const server = await marketplaceManager.getServerById('context7');
            expect(server).toBeDefined();
            expect(server?.id).toBe('context7');
            expect(server?.name).toBe('context7');
        });

        test('should return undefined for non-existent server', async () => {
            const server = await marketplaceManager.getServerById('non-existent');
            expect(server).toBeUndefined();
        });

        test('should search servers by query', async () => {
            const results = await marketplaceManager.searchServers('context');
            expect(results.length).toBeGreaterThan(0);
            expect(results.some(r => r.id === 'context7')).toBe(true);
        });

        test('should clear cache', async () => {
            await marketplaceManager.loadMarketplaceServers();
            expect(marketplaceManager.getCachedServers().length).toBeGreaterThan(0);
            
            marketplaceManager.clearCache();
            expect(marketplaceManager.getCachedServers().length).toBe(0);
        });
    });

    describe('RemoteConfigLoader', () => {
        test('should initialize with empty cache', () => {
            expect(remoteConfigLoader.getCacheCount()).toBe(0);
        });

        test('should load remote configuration', async () => {
            const config = await remoteConfigLoader.loadRemoteConfig({
                url: 'https://example.com/mcp-config'
            });
            
            expect(config).toBeDefined();
            expect(typeof config).toBe('object');
        });

        test('should cache remote configurations', async () => {
            const source = { url: 'https://example.com/test-config' };
            
            // First load
            const firstLoad = await remoteConfigLoader.loadRemoteConfig(source);
            
            // Second load should return cached data
            const secondLoad = await remoteConfigLoader.loadRemoteConfig(source);
            
            expect(firstLoad).toEqual(secondLoad);
        });

        test('should clear specific cache', async () => {
            const source = { url: 'https://example.com/clear-test' };
            await remoteConfigLoader.loadRemoteConfig(source);
            
            expect(remoteConfigLoader.getCacheCount()).toBeGreaterThan(0);
            
            remoteConfigLoader.clearCache(source.url);
            expect(remoteConfigLoader.getCacheCount()).toBe(0);
        });

        test('should clear all cache', async () => {
            const source1 = { url: 'https://example.com/config1' };
            const source2 = { url: 'https://example.com/config2' };
            
            await remoteConfigLoader.loadRemoteConfig(source1);
            await remoteConfigLoader.loadRemoteConfig(source2);
            
            expect(remoteConfigLoader.getCacheCount()).toBe(2);
            
            remoteConfigLoader.clearAllCache();
            expect(remoteConfigLoader.getCacheCount()).toBe(0);
        });
    });

    describe('MemoryService', () => {
        let memoryService: MemoryService;
        let mockMcpService: any;
        let mockContext: any;

        beforeAll(() => {
            mockMcpService = {
                // Mock MCP service methods if needed
            };
            
            mockContext = {
                asAbsolutePath: (path: string) => path
            };
            
            memoryService = new MemoryService(mockMcpService, mockContext);
        });

        test('should initialize with memory bank path', () => {
            expect(memoryService).toBeDefined();
            // The memory bank path should be set in constructor
        });

        test('should create memory context', () => {
            const context = memoryService.createMemoryContext(
                'test-session',
                { key: 'value' },
                'test-source',
                { importance: 1, tags: ['test'] }
            );
            
            expect(context).toBeDefined();
            expect(context.sessionId).toBe('test-session');
            expect(context.context).toEqual({ key: 'value' });
            expect(context.metadata.source).toBe('test-source');
            expect(context.metadata.importance).toBe(1);
            expect(context.metadata.tags).toContain('test');
        });

        test('should handle memory context without optional metadata', () => {
            const context = memoryService.createMemoryContext(
                'test-session-2',
                { data: 'test' },
                'test-source-2'
            );
            
            expect(context).toBeDefined();
            expect(context.metadata.importance).toBeUndefined();
            expect(context.metadata.tags).toBeUndefined();
        });
    });

    describe('MCP Service Marketplace Integration', () => {
        test('should have marketplace methods', () => {
            // This is a basic test to verify the MCP service has the expected marketplace methods
            const mockGateway: any = {};
            const mockContext: any = {
                asAbsolutePath: (path: string) => path
            };
            
            const mcpService = new McpService(mockGateway, mockContext);
            
            expect(mcpService.getMarketplaceServers).toBeDefined();
            expect(mcpService.installMarketplaceServer).toBeDefined();
            expect(mcpService.uninstallMarketplaceServer).toBeDefined();
            expect(mcpService.refreshMarketplace).toBeDefined();
        });

        test('should have marketplace management methods', () => {
            const mockGateway: any = {};
            const mockContext: any = {
                asAbsolutePath: (path: string) => path
            };
            
            const mcpService = new McpService(mockGateway, mockContext);
            
            expect(mcpService.getMarketplaceServers).toBeDefined();
            expect(mcpService.installMarketplaceServer).toBeDefined();
            expect(mcpService.uninstallMarketplaceServer).toBeDefined();
            expect(mcpService.refreshMarketplace).toBeDefined();
        });
    });

    describe('Marketplace Server Configurations', () => {
        test('should validate marketplace server configurations from MarketplaceManager', async () => {
            const marketplaceManager = new MarketplaceManager();
            const servers = await marketplaceManager.loadMarketplaceServers();
            
            // Find context7 server
            const context7Server = servers.find(s => s.id === 'context7');
            expect(context7Server).toBeDefined();
            expect(context7Server?.config.command).toBe('context7-server');
            expect(context7Server?.config.args).toContain('--mcp-mode');
            expect(context7Server?.config.timeout).toBe(15000);
            expect(context7Server?.config.autoReconnect).toBe(true);
            
            // Find sequentialthinking server
            const sequentialServer = servers.find(s => s.id === 'sequentialthinking');
            expect(sequentialServer).toBeDefined();
            expect(sequentialServer?.config.command).toBe('sequentialthinking-server');
            expect(sequentialServer?.config.args).toContain('--mcp-mode');
            expect(sequentialServer?.config.timeout).toBe(10000);
            
            // Find memory server
            const memoryServer = servers.find(s => s.id === 'memory');
            expect(memoryServer).toBeDefined();
            expect(memoryServer?.config.command).toBe('memory-server');
            expect(memoryServer?.config.args).toContain('--mcp-mode');
            expect(memoryServer?.config.args).toContain('--memory-dir');
            expect(memoryServer?.config.timeout).toBe(10000);
        });
    });
});

// Integration test for the complete marketplace flow
describe('MCP Marketplace Integration Flow', () => {
    test('should demonstrate complete marketplace workflow', async () => {
        // This test demonstrates the complete workflow from loading servers to installation
        const marketplaceManager = new MarketplaceManager();
        
        // 1. Load marketplace servers
        const servers = await marketplaceManager.loadMarketplaceServers();
        expect(servers.length).toBeGreaterThan(0);
        
        // 2. Find a specific server
        const context7Server = await marketplaceManager.getServerById('context7');
        expect(context7Server).toBeDefined();
        
        // 3. Verify server configuration
        expect(context7Server?.config).toBeDefined();
        expect(context7Server?.config.command).toBe('context7-server');
        
        // 4. Search for servers
        const searchResults = await marketplaceManager.searchServers('memory');
        expect(searchResults.length).toBeGreaterThan(0);
        
        console.log('✅ MCP Marketplace integration workflow test completed successfully');
    });
});