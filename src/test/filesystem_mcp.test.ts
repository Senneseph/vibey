/**
 * Tests for Filesystem MCP Server
 * Feature: filesystem-mcp
 */

import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs-extra';
import { McpService } from '../agent/mcp/mcp_service';
import { ToolGateway } from '../tools/gateway';
import { PolicyEngine } from '../security/policy_engine';

// Test workspace setup
const testWorkspace = path.join(__dirname, '../../test-workspace');
const filesystemServerPath = path.join(__dirname, '../agent/mcp/filesystem_mcp_server.js');

describe('Filesystem MCP Server Tests', () => {
  let mcpService: McpService;
  let toolGateway: ToolGateway;
  let mockContext: any;

  beforeEach(async () => {
    // Clean up test workspace
    await fs.remove(testWorkspace);
    await fs.ensureDir(testWorkspace);

    // Create mock VS Code extension context
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn(),
        update: jest.fn()
      },
      globalState: {
        get: jest.fn(),
        update: jest.fn()
      },
      extensionPath: path.join(__dirname, '..', '..'),
      asAbsolutePath: (relativePath: string) => path.join(__dirname, '..', '..', relativePath),
      workspaceRoot: testWorkspace // Add workspace root for filesystem operations
    };

    // Initialize components
    const policy = new PolicyEngine(testWorkspace);
    toolGateway = new ToolGateway(policy);
    mcpService = new McpService(toolGateway, mockContext);
  });

  afterEach(async () => {
    // Clean up
    if (mcpService) {
      await mcpService.dispose();
    }
    await fs.remove(testWorkspace);
  });

  /**
   * Test 1: Filesystem MCP Server Auto-Start
   * When no MCP servers are configured, the built-in filesystem server should start automatically
   */
  test('Filesystem MCP Server Auto-Start', async () => {
    // Mock empty configuration (no MCP servers configured)
    const mockGetConfiguration = jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'mcpServers') {
          return {}; // Empty configuration
        }
        return undefined;
      }),
      update: jest.fn()
    }));

    (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

    // Initialize MCP service (simulating Vibey startup)
    await mcpService.initialize();

    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify that filesystem MCP server is started and available
    const serverStates = mcpService.getServerStates();
    const filesystemServer = serverStates.find(s => s.name === 'filesystem-builtin');

    // Assertions: Filesystem server should be available after startup
    expect(filesystemServer).toBeDefined();
    expect(filesystemServer?.status).toBe('connected');
    expect(filesystemServer?.toolCount).toBeGreaterThan(0);
  });

  /**
   * Test 2: Filesystem Tools Availability
   * The filesystem MCP server should provide filesystem tools
   */
  test('Filesystem Tools Availability', async () => {
    // Mock empty configuration
    const mockGetConfiguration = jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'mcpServers') {
          return {}; // Empty configuration
        }
        return undefined;
      }),
      update: jest.fn()
    }));

    (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

    // Initialize MCP service
    await mcpService.initialize();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get all registered tools
    const allTools = toolGateway.getToolDefinitions();
    const toolNames = allTools.map(tool => tool.name);

    // Check for filesystem tools
    const filesystemTools = [
      'filesystem_create_file',
      'filesystem_read_file',
      'filesystem_update_file',
      'filesystem_delete_file',
      'filesystem_move_file',
      'filesystem_list_files'
    ];

    // Assertions: Filesystem tools should be registered
    for (const expectedTool of filesystemTools) {
      expect(toolNames).toContain(expectedTool);
    }
  });

  /**
   * Test 3: Filesystem Tool Execution
   * Filesystem tools should be executable and return valid results
   */
  test('Filesystem Tool Execution', async () => {
    // Mock empty configuration
    const mockGetConfiguration = jest.fn(() => ({
      get: jest.fn((key: string) => {
        if (key === 'mcpServers') {
          return {}; // Empty configuration
        }
        return undefined;
      }),
      update: jest.fn()
    }));

    (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

    // Initialize MCP service
    await mcpService.initialize();
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Find filesystem tools
    const allTools = toolGateway.getToolDefinitions();
    const createFileTool = allTools.find(tool => tool.name === 'filesystem_create_file');
    const listFilesTool = allTools.find(tool => tool.name === 'filesystem_list_files');

    expect(createFileTool).toBeDefined();
    expect(listFilesTool).toBeDefined();

    if (createFileTool && listFilesTool) {
      // Test file creation
      const testFilePath = 'test-file.txt';
      const testContent = 'This is a test file.';

      try {
        // Create a file using the MCP tool
        const createResult = await toolGateway.executeTool({
          id: 'test-create',
          name: 'filesystem_create_file',
          parameters: {
            filePath: testFilePath,
            content: testContent
          }
        });

        expect(createResult).toBeDefined();
        expect(createResult.status).not.toBe('error');

        // List files to verify the file was created
        const listResult = await toolGateway.executeTool({
          id: 'test-list',
          name: 'filesystem_list_files',
          parameters: {
            directoryPath: '.'
          }
        });

        expect(listResult).toBeDefined();
        expect(listResult.status).not.toBe('error');

        // Add a small delay to ensure the file is created
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify the file exists in the workspace
        const fileExists = await fs.pathExists(path.join(testWorkspace, testFilePath));
        expect(fileExists).toBe(true);

        // Clean up
        await fs.unlink(path.join(testWorkspace, testFilePath));

      } catch (error) {
        console.error('Filesystem tool execution failed:', error);
        throw error;
      }
    }
  });
});