import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as vscode from 'vscode';
import * as path from 'path';
import { McpMarketplaceView } from '../ui/marketplace/McpMarketplaceView';

describe('MCP Marketplace UI Integration Tests', () => {
    let mockContext: any;
    let mockMcpService: any;

    beforeAll(() => {
        // Create a simple mock context
        mockContext = {
            extensionUri: {
                fsPath: path.join(__dirname, '..', '..')
            },
            extensionPath: path.join(__dirname, '..', '..'),
            subscriptions: [],
            asAbsolutePath: jest.fn()
        };

        // Mock MCP service
        mockMcpService = {
            getMarketplaceServers: jest.fn().mockResolvedValue([]),
            getServerStates: jest.fn().mockReturnValue([]),
            installMarketplaceServer: jest.fn().mockResolvedValue(true),
            uninstallMarketplaceServer: jest.fn().mockResolvedValue(true),
            addEventListener: jest.fn(),
            initialize: jest.fn().mockResolvedValue(undefined),
            reloadServers: jest.fn().mockResolvedValue(undefined),
            refreshMarketplace: jest.fn().mockResolvedValue(undefined),
            dispose: jest.fn().mockResolvedValue(undefined)
        };
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    test('should create MCP Marketplace View instance', () => {
        const marketplaceView = new McpMarketplaceView(mockContext, mockMcpService);
        expect(marketplaceView).toBeInstanceOf(McpMarketplaceView);
    });

    test('should have show method', () => {
        const marketplaceView = new McpMarketplaceView(mockContext, mockMcpService);
        expect(typeof marketplaceView.show).toBe('function');
    });

    test('should have dispose method', () => {
        const marketplaceView = new McpMarketplaceView(mockContext, mockMcpService);
        expect(typeof marketplaceView.dispose).toBe('function');
    });

    test('should register marketplace command', () => {
        const registerCommandMock = jest.fn();
        (vscode.commands.registerCommand as jest.Mock) = registerCommandMock;
        
        McpMarketplaceView.registerCommand(mockContext, mockMcpService);
        
        expect(registerCommandMock).toHaveBeenCalledWith('vibey.showMcpMarketplace', expect.any(Function));
    });

    test('should handle marketplace command execution', async () => {
        const showMock = jest.fn();
        const marketplaceView = new McpMarketplaceView(mockContext, mockMcpService);
        marketplaceView.show = showMock;
        
        // Simulate command execution
        const commandHandler = McpMarketplaceView.registerCommand(mockContext, mockMcpService);
        
        // Execute the command
        await (commandHandler as any).callback();
        
        expect(showMock).toHaveBeenCalled();
    });

    test('should handle marketplace refresh', async () => {
        const marketplaceView = new McpMarketplaceView(mockContext, mockMcpService);
        
        // Mock the panel
        const mockPanel = {
            webview: {
                postMessage: jest.fn()
            },
            reveal: jest.fn(),
            onDidDispose: jest.fn(),
            dispose: jest.fn()
        };
        
        (marketplaceView as any).panel = mockPanel;
        
        // Call refresh marketplace
        await (marketplaceView as any).refreshMarketplace();
        
        expect(mockMcpService.getMarketplaceServers).toHaveBeenCalled();
        expect(mockMcpService.getServerStates).toHaveBeenCalled();
        expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
            type: 'marketplace-update'
        }));
    });
});