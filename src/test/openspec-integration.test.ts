/**
 * Property-based tests for OpenSpec Integration
 * Feature: openspec-integration
 */

import * as fc from 'fast-check';
import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn, ChildProcess } from 'child_process';
import { McpService } from '../agent/mcp/mcp_service';
import { ToolGateway } from '../tools/gateway';
import { PolicyEngine } from '../security/policy_engine';

// Test workspace setup
const testWorkspace = path.join(__dirname, '../../test-workspace');
const openspecServerPath = path.join(__dirname, '../../openspec-server/build/index.js');

describe('OpenSpec Integration Property Tests', () => {
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
          extensionPath: __dirname,
          asAbsolutePath: (relativePath: string) => {
              // Mock asAbsolutePath to resolve paths relative to the extension directory
              // For OpenSpec server, we need to go up from src/test to the project root
              if (relativePath === 'openspec-server/build/index.js') {
                  return path.join(__dirname, '../../openspec-server/build/index.js');
              }
              return path.isAbsolute(relativePath)
                  ? relativePath
                  : path.join(__dirname, relativePath);
          }
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
   * Property 1: OpenSpec MCP Server Auto-Start
   * For any Vibey startup sequence, the native OpenSpec MCP server should be automatically started and become available
   * Validates: Requirements 1.1
   */
  test('Property 1: OpenSpec MCP Server Auto-Start', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          serverConfig: fc.record({
            command: fc.constant('node'),
            args: fc.constant([openspecServerPath]),
            env: fc.record({})
          })
        }),
        async (testData) => {
          // **Feature: openspec-integration, Property 1: OpenSpec MCP Server Auto-Start**
          
          // Simulate Vibey startup by initializing MCP service with OpenSpec server
          const serverName = 'openspec';
          const config = {
            mcpServers: {
              [serverName]: testData.serverConfig
            }
          };

          // Mock the configuration
          const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string) => {
              if (key === 'mcpServers') {
                return config.mcpServers;
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

          // Verify that OpenSpec MCP server is started and available
          const serverStates = mcpService.getServerStates();
          const openspecServer = serverStates.find(s => s.name === serverName);

          // Property assertion: OpenSpec server should be available after startup
          expect(openspecServer).toBeDefined();
          expect(openspecServer?.status).toBe('connected');
          expect(openspecServer?.toolCount).toBeGreaterThan(0);
        }
      ),
      { numRuns: 5, timeout: 30000 } // Reduced runs for integration test
    );
  });

  /**
   * Property 2: OpenSpec Tool Registration
   * For any running OpenSpec MCP server, all OpenSpec tools should be registered and available in the tool gateway
   * Validates: Requirements 1.2
   */
  test('Property 2: OpenSpec Tool Registration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          expectedTools: fc.constant([
            'openspec_create_proposal',
            'openspec_apply_change', 
            'openspec_archive_change',
            'openspec_start_discovery',
            'openspec_answer_question',
            'openspec_generate_spec',
            'openspec_list_specifications',
            'openspec_validate_specification'
          ])
        }),
        async (testData) => {
          // **Feature: openspec-integration, Property 2: OpenSpec Tool Registration**
          
          // Start OpenSpec MCP server
          const serverConfig = {
            mcpServers: {
              openspec: {
                command: 'node',
                args: [openspecServerPath],
                env: {}
              }
            }
          };

          const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string) => key === 'mcpServers' ? serverConfig.mcpServers : undefined),
            update: jest.fn()
          }));

          (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

          await mcpService.initialize();
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Get all registered tools
          const allTools = toolGateway.getToolDefinitions();
          const toolNames = allTools.map(tool => tool.name);

          // Property assertion: All expected OpenSpec tools should be registered
          for (const expectedTool of testData.expectedTools) {
            expect(toolNames).toContain(expectedTool);
          }

          // Verify tools are actually callable
          const openspecTools = allTools.filter(tool => tool.name.startsWith('openspec_'));
          expect(openspecTools.length).toBeGreaterThanOrEqual(testData.expectedTools.length);
        }
      ),
      { numRuns: 3, timeout: 30000 }
    );
  });

  /**
   * Property 3: OpenSpec Tool Execution Routing
   * For any OpenSpec tool call, it should be properly routed to and executed by the native MCP server
   * Validates: Requirements 1.3
   */
  test('Property 3: OpenSpec Tool Execution Routing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({
            toolName: fc.constant('openspec_list_specifications'),
            parameters: fc.record({})
          }),
          fc.record({
            toolName: fc.constant('openspec_create_proposal'),
            parameters: fc.record({ description: fc.string({ minLength: 10, maxLength: 100 }) })
          })
        ),
        async (testData) => {
          // **Feature: openspec-integration, Property 3: OpenSpec Tool Execution Routing**
          
          // Setup OpenSpec MCP server
          const serverConfig = {
            mcpServers: {
              openspec: {
                command: 'node',
                args: [openspecServerPath],
                env: {}
              }
            }
          };

          const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string) => key === 'mcpServers' ? serverConfig.mcpServers : undefined),
            update: jest.fn()
          }));

          (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

          await mcpService.initialize();
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Find the OpenSpec tool
          const allTools = toolGateway.getToolDefinitions();
          const targetTool = allTools.find(tool => tool.name === testData.toolName);
          
          if (targetTool) {
            try {
              // Execute the tool through the gateway
              const result = await toolGateway.executeTool({
                id: 'test-call',
                name: testData.toolName,
                parameters: testData.parameters
              });

              // Property assertion: Tool execution should succeed and return valid result
              expect(result).toBeDefined();
              expect(result.status).not.toBe('error');
              
              // For create_proposal, verify it returns a proposal structure
              if (testData.toolName === 'openspec_create_proposal' && result.output) {
                const proposalData = JSON.parse(result.output);
                expect(proposalData).toHaveProperty('id');
                expect(proposalData).toHaveProperty('title');
                expect(proposalData).toHaveProperty('status');
              }
            } catch (error) {
              // Tool execution should not throw errors for valid parameters
              throw new Error(`Tool execution failed: ${error}`);
            }
          }
        }
      ),
      { numRuns: 3, timeout: 30000 }
    );
  });

  /**
   * Property 4: OpenSpec Server Error Handling
   * For any OpenSpec server failure, clear error messages and recovery options should be provided
   * Validates: Requirements 1.4
   */
  test('Property 4: OpenSpec Server Error Handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          invalidConfig: fc.record({
            command: fc.constantFrom('nonexistent-command', 'invalid-path'),
            args: fc.array(fc.string(), { minLength: 0, maxLength: 3 }),
            env: fc.record({})
          })
        }),
        async (testData) => {
          // **Feature: openspec-integration, Property 4: OpenSpec Server Error Handling**
          
          // Setup invalid OpenSpec MCP server configuration
          const serverConfig = {
            mcpServers: {
              openspec: testData.invalidConfig
            }
          };

          const mockGetConfiguration = jest.fn(() => ({
            get: jest.fn((key: string) => key === 'mcpServers' ? serverConfig.mcpServers : undefined),
            update: jest.fn()
          }));

          (global as any).mockVscode.workspace.getConfiguration = mockGetConfiguration;

          // Initialize MCP service with invalid config
          await mcpService.initialize();
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Check server states
          const serverStates = mcpService.getServerStates();
          const openspecServer = serverStates.find(s => s.name === 'openspec');

          // Property assertion: Server failure should be detected and reported
          if (openspecServer) {
            expect(openspecServer.status).toBe('error');
            expect(openspecServer.error).toBeDefined();
            expect(typeof openspecServer.error).toBe('string');
            expect(openspecServer.error!.length).toBeGreaterThan(0);
          }

          // Verify that error handling doesn't crash the system
          expect(mcpService).toBeDefined();
          expect(() => mcpService.getServerStates()).not.toThrow();
        }
      ),
      { numRuns: 3, timeout: 30000 }
    );
  });
});

// Helper function to check if OpenSpec server is running
async function isOpenSpecServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const testProcess = spawn('node', [openspecServerPath]);
    
    let hasOutput = false;
    testProcess.stderr.on('data', (data) => {
      if (data.toString().includes('Enhanced OpenSpec MCP server running')) {
        hasOutput = true;
      }
    });

    testProcess.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      testProcess.kill();
      resolve(hasOutput);
    }, 2000);
  });
}

// Integration test to verify OpenSpec server can start independently
describe('OpenSpec Server Integration', () => {
  test('OpenSpec server can start and respond to basic commands', async () => {
    const isRunning = await isOpenSpecServerRunning();
    expect(isRunning).toBe(true);
  });
});