/**
 * Feature Test Runner - Tests various Vibey features to ensure they work with the configured LLM
 * Provides diagnostic information and troubleshooting help
 */

import { AgentOrchestrator } from '../orchestrator';
import { ToolGateway } from '../../tools/gateway';
import { McpService } from '../mcp/mcp_service';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface TestResult {
    feature: string;
    testName: string;
    success: boolean;
    message: string;
    details?: any;
    timestamp: number;
}

export interface FeatureTestReport {
    llmProvider: string;
    llmModel: string;
    timestamp: number;
    results: TestResult[];
    summary: {
        totalTests: number;
        passedTests: number;
        failedTests: number;
        successRate: number;
    };
}

export class FeatureTestRunner {
    constructor(
        private orchestrator: AgentOrchestrator,
        private tools: ToolGateway,
        private mcpService: McpService,
        private taskManager: any, // TaskManager type
        private workspaceRoot: string
    ) {}

    /**
     * Run all feature tests
     */
    public async runAllTests(): Promise<FeatureTestReport> {
        const results: TestResult[] = [];
        const startTime = Date.now();

        // Get current LLM configuration
        const config = vscode.workspace.getConfiguration('vibey');
        const llmProvider = config.get<string>('provider', 'unknown');
        const llmModel = config.get<string>('model', 'unknown');

        try {
            // Ensure MCP service is initialized before running tests
            await this.waitForMCPServers();

            // Run individual feature tests
            results.push(...await this.testLLMConnectivity());
            results.push(...await this.testFileOperations());
            results.push(...await this.testMCPServer());
            results.push(...await this.testWebFetching());
            results.push(...await this.testTerminalOperations());
            results.push(...await this.testOpenSpecOperations());
            results.push(...await this.testTaskOperations());

            // Calculate summary
            const totalTests = results.length;
            const passedTests = results.filter(r => r.success).length;
            const failedTests = totalTests - passedTests;
            const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

            return {
                llmProvider,
                llmModel,
                timestamp: startTime,
                results,
                summary: {
                    totalTests,
                    passedTests,
                    failedTests,
                    successRate
                }
            };

        } catch (error: any) {
            console.error('[VIBEY][FeatureTestRunner] Error running tests:', error);
            return {
                llmProvider,
                llmModel,
                timestamp: startTime,
                results: [{
                    feature: 'Test Runner',
                    testName: 'Overall Test Execution',
                    success: false,
                    message: `Test execution failed: ${error.message}`,
                    details: { error: error.stack },
                    timestamp: Date.now()
                }],
                summary: {
                    totalTests: 1,
                    passedTests: 0,
                    failedTests: 1,
                    successRate: 0
                }
            };
        }
    }

    /**
     * Test LLM connectivity and basic functionality
     */
    private async testLLMConnectivity(): Promise<TestResult[]> {
        const results: TestResult[] = [];
        const testStart = Date.now();

        try {
            // Test 1: Basic LLM connectivity
            const simpleTest = await this.orchestrator.chat('Hello, this is a test message.', [], () => {});
            results.push({
                feature: 'LLM',
                testName: 'Basic Connectivity',
                success: true,
                message: 'LLM responded successfully to basic message',
                details: { responseLength: simpleTest.length },
                timestamp: Date.now()
            });

            // Test 2: LLM reasoning capability
            const reasoningTest = await this.orchestrator.chat('What is 2 + 2?', [], () => {});
            const hasCorrectAnswer = reasoningTest.includes('4') || reasoningTest.includes('four');
            results.push({
                feature: 'LLM',
                testName: 'Reasoning Capability',
                success: hasCorrectAnswer,
                message: hasCorrectAnswer ? 'LLM correctly answered basic math question' : 'LLM failed to answer basic math question',
                details: { response: reasoningTest },
                timestamp: Date.now()
            });

        } catch (error: any) {
            results.push({
                feature: 'LLM',
                testName: 'Connectivity Test',
                success: false,
                message: `LLM connectivity test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test file operations
     */
    private async testFileOperations(): Promise<TestResult[]> {
        const results: TestResult[] = [];
        const testFilePath = path.join(this.workspaceRoot, 'vibey-test-file.txt');
        const testContent = 'This is a test file created by Vibey feature testing.';

        try {
            // Test 1: Write file
            const writeTool = this.tools.getToolDefinitions().find(t => t.name === 'write_file');
            if (writeTool) {
                await writeTool.execute({ path: testFilePath, content: testContent }, {});
                results.push({
                    feature: 'File Operations',
                    testName: 'Write File',
                    success: true,
                    message: 'Successfully wrote test file',
                    details: { filePath: testFilePath },
                    timestamp: Date.now()
                });
            } else {
                results.push({
                    feature: 'File Operations',
                    testName: 'Write File',
                    success: false,
                    message: 'Write file tool not available',
                    timestamp: Date.now()
                });
            }

            // Test 2: Read file
            const readTool = this.tools.getToolDefinitions().find(t => t.name === 'read_file');
            if (readTool) {
                const fileContent = await readTool.execute({ path: testFilePath }, {});
                const contentMatches = fileContent === testContent;
                results.push({
                    feature: 'File Operations',
                    testName: 'Read File',
                    success: contentMatches,
                    message: contentMatches ? 'Successfully read test file with correct content' : 'File content does not match',
                    details: { expected: testContent, actual: fileContent },
                    timestamp: Date.now()
                });
            } else {
                results.push({
                    feature: 'File Operations',
                    testName: 'Read File',
                    success: false,
                    message: 'Read file tool not available',
                    timestamp: Date.now()
                });
            }

            // Clean up
            try {
                await fs.unlink(testFilePath);
            } catch (cleanupError) {
                console.warn('[VIBEY][FeatureTestRunner] Failed to clean up test file:', cleanupError);
            }

        } catch (error: any) {
            results.push({
                feature: 'File Operations',
                testName: 'File Operations Test',
                success: false,
                message: `File operations test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test MCP server functionality
     */
    private async testMCPServer(): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Wait for MCP service to fully initialize and connect servers
            const waitResult = await this.waitForMCPServers();

            // Test 1: Check if MCP servers are configured or available
            const config = vscode.workspace.getConfiguration('vibey');
            const mcpServers = config.get<Record<string, any>>('mcpServers') || {};
            const availableServerStates = this.mcpService.getServerStates();

            // Enhanced diagnostics for configuration check
            const diagnostics = {
                configuredServers: Object.keys(mcpServers),
                availableServerStates: availableServerStates.map(s => ({
                    name: s.name,
                    status: s.status,
                    toolCount: s.toolCount
                })),
                waitResult: {
                    timedOut: waitResult.timedOut,
                    finalServerCount: waitResult.serverCount,
                    connectedCount: waitResult.connectedCount
                }
            };

            // Check if we have any servers (either configured or built-in)
            if (Object.keys(mcpServers).length === 0 && availableServerStates.length === 0) {
                results.push({
                    feature: 'MCP Server',
                    testName: 'Configuration Check',
                    success: false,
                    message: 'No MCP servers configured or detected. This may indicate a load-order issue.',
                    details: diagnostics,
                    timestamp: Date.now()
                });
                return results;
            }

            // If we have server states (built-in servers), consider this a success
            if (availableServerStates.length > 0) {
                const connectedServers = availableServerStates.filter(s => s.status === 'connected');
                results.push({
                    feature: 'MCP Server',
                    testName: 'Configuration Check',
                    success: true,
                    message: `Found ${availableServerStates.length} MCP server(s): ${connectedServers.length} connected, ${availableServerStates.length - connectedServers.length} pending`,
                    details: diagnostics,
                    timestamp: Date.now()
                });
            } else {
                results.push({
                    feature: 'MCP Server',
                    testName: 'Configuration Check',
                    success: true,
                    message: `Found ${Object.keys(mcpServers).length} MCP server(s) configured`,
                    details: { configuredServers: Object.keys(mcpServers) },
                    timestamp: Date.now()
                });
            }

            // Test 2: Check server connection states
            const currentServerStates = this.mcpService.getServerStates();
            const connectedServers = currentServerStates.filter(s => s.status === 'connected');
            
            results.push({
                feature: 'MCP Server',
                testName: 'Connection Status',
                success: connectedServers.length > 0,
                message: connectedServers.length > 0
                    ? `${connectedServers.length} server(s) connected successfully`
                    : 'No MCP servers are currently connected',
                details: {
                    totalServers: currentServerStates.length,
                    connectedServers: connectedServers.map(s => s.name),
                    disconnectedServers: currentServerStates.filter(s => s.status !== 'connected').map(s => s.name)
                },
                timestamp: Date.now()
            });

            // Test 3: Check available tools from MCP servers
            const allTools = this.tools.getToolDefinitions();
            const mcpToolCount = allTools.length; // This includes both built-in and MCP tools
            
            results.push({
                feature: 'MCP Server',
                testName: 'Tool Availability',
                success: mcpToolCount > 0,
                message: mcpToolCount > 0 
                    ? `${mcpToolCount} tools available (including MCP tools)`
                    : 'No tools available from MCP servers',
                details: {
                    toolCount: mcpToolCount,
                    sampleTools: allTools.slice(0, 5).map(t => t.name)
                },
                timestamp: Date.now()
            });

        } catch (error: any) {
            results.push({
                feature: 'MCP Server',
                testName: 'MCP Server Test',
                success: false,
                message: `MCP server test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test web fetching and internet search capabilities
     */
    private async testWebFetching(): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Test 1: Check if search tools are available
            const searchTool = this.tools.getToolDefinitions().find(t => t.name === 'internet_search');
            const fetchTool = this.tools.getToolDefinitions().find(t => t.name === 'fetch_code_snippet');
            
            const hasSearchTools = !!searchTool || !!fetchTool;
            
            results.push({
                feature: 'Web Fetching',
                testName: 'Tool Availability',
                success: hasSearchTools,
                message: hasSearchTools 
                    ? 'Web fetching tools are available'
                    : 'No web fetching tools available',
                details: {
                    hasInternetSearch: !!searchTool,
                    hasFetchCodeSnippet: !!fetchTool
                },
                timestamp: Date.now()
            });

            if (hasSearchTools) {
                // Test 2: Try a simple search (if available)
                if (searchTool) {
                    try {
                        const searchResult = await searchTool.execute({
                            query: 'Vibey AI agent',
                            max_results: 3
                        }, {});
                        
                        results.push({
                            feature: 'Web Fetching',
                            testName: 'Internet Search',
                            success: true,
                            message: 'Internet search completed successfully',
                            details: { 
                                resultLength: searchResult.length,
                                hasResults: searchResult.includes('Result')
                            },
                            timestamp: Date.now()
                        });
                    } catch (searchError: any) {
                        results.push({
                            feature: 'Web Fetching',
                            testName: 'Internet Search',
                            success: false,
                            message: `Internet search failed: ${searchError.message}`,
                            details: { error: searchError.stack },
                            timestamp: Date.now()
                        });
                    }
                }
            }

        } catch (error: any) {
            results.push({
                feature: 'Web Fetching',
                testName: 'Web Fetching Test',
                success: false,
                message: `Web fetching test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test terminal operations
     */
    private async testTerminalOperations(): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Test 1: Check if terminal tools are available
            const terminalTools = this.tools.getToolDefinitions().filter(t => t.name.startsWith('terminal_'));

            results.push({
                feature: 'Terminal Operations',
                testName: 'Tool Availability',
                success: terminalTools.length > 0,
                message: terminalTools.length > 0
                    ? `${terminalTools.length} terminal tools available`
                    : 'No terminal tools available',
                details: {
                    availableTools: terminalTools.map(t => t.name)
                },
                timestamp: Date.now()
            });

            // Test 2: Try to list terminals (if available)
            const listTerminalTool = terminalTools.find(t => t.name === 'terminal_list');
            if (listTerminalTool) {
                try {
                    const terminalList = await listTerminalTool.execute({}, {});
                    results.push({
                        feature: 'Terminal Operations',
                        testName: 'List Terminals',
                        success: true,
                        message: 'Successfully listed terminals',
                        details: {
                            terminalList: terminalList,
                            hasTerminals: !terminalList.includes('No Vibey terminals')
                        },
                        timestamp: Date.now()
                    });
                } catch (terminalError: any) {
                    results.push({
                        feature: 'Terminal Operations',
                        testName: 'List Terminals',
                        success: false,
                        message: `Failed to list terminals: ${terminalError.message}`,
                        details: { error: terminalError.stack },
                        timestamp: Date.now()
                    });
                }
            }

        } catch (error: any) {
            results.push({
                feature: 'Terminal Operations',
                testName: 'Terminal Operations Test',
                success: false,
                message: `Terminal operations test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test OpenSpec operations
     */
    private async testOpenSpecOperations(): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Test 1: Check if OpenSpec tools are available
            const openspecTools = this.tools.getToolDefinitions().filter(t => t.name.startsWith('openspec_'));

            // Debug information
            const allTools = this.tools.getToolDefinitions();
            const mcpServerStates = this.mcpService.getServerStates();
            
            // Look for OpenSpec servers, prioritizing connected ones and built-in server
            let openspecServerState = mcpServerStates.find(s => s.name.includes('openspec') && s.status === 'connected');
            
            // If no connected OpenSpec server found, look for any OpenSpec server
            if (!openspecServerState) {
                openspecServerState = mcpServerStates.find(s => s.name.includes('openspec'));
            }
            
            // Specifically look for the built-in OpenSpec server
            const openspecBuiltinState = mcpServerStates.find(s => s.name === 'openspec-builtin');
            
            // Use the built-in server if it exists and is connected, regardless of other servers
            if (openspecBuiltinState && openspecBuiltinState.status === 'connected') {
                openspecServerState = openspecBuiltinState;
            }

            results.push({
                feature: 'OpenSpec',
                testName: 'Tool Availability',
                success: openspecTools.length > 0,
                message: openspecTools.length > 0
                    ? `${openspecTools.length} OpenSpec tools available`
                    : 'No OpenSpec tools available',
                details: {
                    availableTools: openspecTools.map(t => t.name),
                    allTools: allTools.map(t => t.name),
                    mcpServers: mcpServerStates.map(s => ({ name: s.name, status: s.status, toolCount: s.toolCount })),
                    openspecServer: openspecServerState ? {
                        name: openspecServerState.name,
                        status: openspecServerState.status,
                        error: openspecServerState.error,
                        toolCount: openspecServerState.toolCount,
                        registeredTools: openspecServerState.registeredTools
                    } : 'No OpenSpec server found',
                    openspecServerStates: mcpServerStates.filter(s => s.name.includes('openspec')).map(s => ({
                        name: s.name,
                        status: s.status,
                        toolCount: s.toolCount,
                        error: s.error
                    }))
                },
                timestamp: Date.now()
            });

            // Test 2: Try to create a proposal (if available)
            const createProposalTool = openspecTools.find(t => t.name === 'openspec_create_proposal');
            if (createProposalTool) {
                try {
                    const proposal = await createProposalTool.execute(
                        { description: 'Test feature for OpenSpec testing' },
                        {}
                    );
                    results.push({
                        feature: 'OpenSpec',
                        testName: 'Create Proposal',
                        success: true,
                        message: 'Successfully created OpenSpec proposal',
                        details: {
                            proposal: proposal,
                            hasProposalId: proposal.includes('"id"')
                        },
                        timestamp: Date.now()
                    });
                } catch (proposalError: any) {
                    results.push({
                        feature: 'OpenSpec',
                        testName: 'Create Proposal',
                        success: false,
                        message: `Failed to create proposal: ${proposalError.message}`,
                        details: { error: proposalError.stack },
                        timestamp: Date.now()
                    });
                }
            }

            // Test 3: Try to list specifications (if available)
            const listSpecsTool = openspecTools.find(t => t.name === 'openspec_list_specifications');
            if (listSpecsTool) {
                try {
                    const specs = await listSpecsTool.execute({}, {});
                    results.push({
                        feature: 'OpenSpec',
                        testName: 'List Specifications',
                        success: true,
                        message: 'Successfully listed specifications',
                        details: {
                            specs: specs,
                            hasSpecs: specs.includes('"title"')
                        },
                        timestamp: Date.now()
                    });
                } catch (specsError: any) {
                    results.push({
                        feature: 'OpenSpec',
                        testName: 'List Specifications',
                        success: false,
                        message: `Failed to list specifications: ${specsError.message}`,
                        details: { error: specsError.stack },
                        timestamp: Date.now()
                    });
                }
            }

        } catch (error: any) {
            results.push({
                feature: 'OpenSpec',
                testName: 'OpenSpec Operations Test',
                success: false,
                message: `OpenSpec operations test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Test Vibey Task operations
     */
    private async testTaskOperations(): Promise<TestResult[]> {
        const results: TestResult[] = [];

        try {
            // Test 1: Create a basic task
            const testTask = this.taskManager.createTask('Test Feature Task', [
                'Analyze requirements',
                'Implement solution',
                'Test implementation'
            ]);

            results.push({
                feature: 'Tasks',
                testName: 'Create Task',
                success: testTask !== undefined,
                message: testTask ? 'Successfully created task' : 'Failed to create task',
                details: {
                    taskId: testTask?.id,
                    taskTitle: testTask?.title,
                    stepCount: testTask?.steps.length
                },
                timestamp: Date.now()
            });

            // Test 2: Update task status
            if (testTask) {
                const updatedTask = this.taskManager.updateTaskStatus(testTask.id, 'in-progress');
                results.push({
                    feature: 'Tasks',
                    testName: 'Update Task Status',
                    success: updatedTask?.status === 'in-progress',
                    message: updatedTask?.status === 'in-progress' ? 'Successfully updated task status' : 'Failed to update task status',
                    details: {
                        taskId: testTask.id,
                        newStatus: updatedTask?.status
                    },
                    timestamp: Date.now()
                });
            }

            // Test 3: Update step status
            if (testTask && testTask.steps.length > 0) {
                const stepUpdateResult = this.taskManager.updateStepStatus(testTask.id, 0, 'completed');
                results.push({
                    feature: 'Tasks',
                    testName: 'Update Step Status',
                    success: stepUpdateResult !== undefined,
                    message: stepUpdateResult ? 'Successfully updated step status' : 'Failed to update step status',
                    details: {
                        taskId: testTask.id,
                        stepIndex: 0,
                        stepStatus: stepUpdateResult?.steps[0].status
                    },
                    timestamp: Date.now()
                });
            }

            // Test 4: List tasks
            const allTasks = this.taskManager.listTasks();
            results.push({
                feature: 'Tasks',
                testName: 'List Tasks',
                success: allTasks.length > 0,
                message: allTasks.length > 0 ? `Successfully listed ${allTasks.length} tasks` : 'No tasks found',
                details: {
                    taskCount: allTasks.length,
                    taskTitles: allTasks.map((t: any) => t.title)
                },
                timestamp: Date.now()
            });

            // Test 5: Get task progress
            if (testTask) {
                const progress = this.taskManager.getTaskProgress(testTask.id);
                results.push({
                    feature: 'Tasks',
                    testName: 'Get Task Progress',
                    success: progress !== null,
                    message: progress ? `Task progress: ${progress.percentage}%` : 'Failed to get task progress',
                    details: {
                        taskId: testTask.id,
                        progress: progress
                    },
                    timestamp: Date.now()
                });
            }

        } catch (error: any) {
            results.push({
                feature: 'Tasks',
                testName: 'Task Operations Test',
                success: false,
                message: `Task operations test failed: ${error.message}`,
                details: { error: error.stack },
                timestamp: Date.now()
            });
        }

        return results;
    }

    /**
     * Wait for MCP servers to be initialized and connected
     * Returns diagnostic information about the wait result
     */
    private async waitForMCPServers(): Promise<{
        timedOut: boolean;
        serverCount: number;
        connectedCount: number;
        connectingCount: number;
    }> {
        // Wait up to 10 seconds for MCP servers to initialize (increased from 5)
        const startTime = Date.now();
        const timeout = 10000; // 10 seconds
        const pollInterval = 100; // Check every 100ms

        let lastServerCount = 0;
        let stableCount = 0;

        while (Date.now() - startTime < timeout) {
            const serverStates = this.mcpService.getServerStates();
            const currentCount = serverStates.length;

            // Track if server count is stable (hasn't changed for a few iterations)
            if (currentCount === lastServerCount) {
                stableCount++;
            } else {
                stableCount = 0;
                lastServerCount = currentCount;
            }

            // If we have any servers (even if not all are connected), we're good to go
            if (serverStates.length > 0) {
                const connectedServers = serverStates.filter(s => s.status === 'connected');
                const connectingServers = serverStates.filter(s => s.status === 'connecting');

                // If server count has been stable for 5 iterations (500ms) and we have connected servers
                if (stableCount >= 5 && connectedServers.length > 0) {
                    console.log(`[VIBEY][FeatureTest] MCP servers initialized: ${connectedServers.length} connected, ${connectingServers.length} connecting`);
                    return {
                        timedOut: false,
                        serverCount: serverStates.length,
                        connectedCount: connectedServers.length,
                        connectingCount: connectingServers.length
                    };
                }
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // If we get here, timeout reached - return current state
        const serverStates = this.mcpService.getServerStates();
        const connectedServers = serverStates.filter(s => s.status === 'connected');
        const connectingServers = serverStates.filter(s => s.status === 'connecting');

        console.log('[VIBEY][FeatureTest] MCP server wait timeout reached. Current state:', {
            total: serverStates.length,
            connected: connectedServers.length,
            connecting: connectingServers.length
        });

        return {
            timedOut: true,
            serverCount: serverStates.length,
            connectedCount: connectedServers.length,
            connectingCount: connectingServers.length
        };
    }

    /**
     * Generate troubleshooting recommendations based on test results
     */
    public generateTroubleshootingReport(report: FeatureTestReport): string {
        const recommendations: string[] = [];
        const failedTests = report.results.filter(r => !r.success);

        if (failedTests.length === 0) {
            return '✅ All tests passed! Your Vibey setup is working correctly.';
        }

        // LLM-specific recommendations
        const llmFailures = failedTests.filter(r => r.feature === 'LLM');
        if (llmFailures.length > 0) {
            recommendations.push(
                '🔧 **LLM Issues Detected:**',
                '- Check your LLM provider configuration in Vibey settings',
                '- Verify that your LLM server (Ollama, etc.) is running',
                '- Check network connectivity to the LLM server',
                '- Try restarting your LLM server',
                '- Ensure you have the correct model loaded'
            );
        }

        // File operations recommendations
        const fileFailures = failedTests.filter(r => r.feature === 'File Operations');
        if (fileFailures.length > 0) {
            recommendations.push(
                '📁 **File Operations Issues:**',
                '- Check file system permissions for the workspace directory',
                '- Verify that Vibey has access to read/write files',
                '- Check if the workspace directory exists and is accessible'
            );
        }

        // MCP server recommendations
        const mcpFailures = failedTests.filter(r => r.feature === 'MCP Server');
        if (mcpFailures.length > 0) {
            recommendations.push(
                '🔌 **MCP Server Issues:**',
                '- Check your MCP server configuration in Vibey settings',
                '- Verify that MCP servers are running and accessible',
                '- Check network connectivity to MCP servers',
                '- Review MCP server logs for errors'
            );
        }

        // Web fetching recommendations
        const webFailures = failedTests.filter(r => r.feature === 'Web Fetching');
        if (webFailures.length > 0) {
            recommendations.push(
                '🌐 **Web Fetching Issues:**',
                '- Check your internet connection',
                '- Verify that search tools are properly configured',
                '- Check if there are any network restrictions or firewalls',
                '- Some web features may require additional setup'
            );
        }

        // Terminal recommendations
        const terminalFailures = failedTests.filter(r => r.feature === 'Terminal Operations');
        if (terminalFailures.length > 0) {
            recommendations.push(
                '💻 **Terminal Operations Issues:**',
                '- Check terminal permissions and accessibility',
                '- Verify that your shell environment is properly configured',
                '- Some terminal features may require specific shell types'
            );
        }

        // OpenSpec recommendations
        const openspecFailures = failedTests.filter(r => r.feature === 'OpenSpec');
        if (openspecFailures.length > 0) {
            recommendations.push(
                '📋 **OpenSpec Issues:**',
                '- Check if the OpenSpec server is running and accessible',
                '- Verify that OpenSpec tools are properly registered',
                '- Check OpenSpec server logs for errors',
                '- Ensure the workspace has proper write permissions for OpenSpec files'
            );
        }

        // Tasks recommendations
        const taskFailures = failedTests.filter(r => r.feature === 'Tasks');
        if (taskFailures.length > 0) {
            recommendations.push(
                '📝 **Task Management Issues:**',
                '- Check if task manager is properly initialized',
                '- Verify task creation and update permissions',
                '- Ensure task storage is working correctly',
                '- Check for any task manager configuration issues'
            );
        }

        return `## 🔍 Troubleshooting Recommendations

${recommendations.join('\n')}

## 📊 Test Summary
- **Total Tests**: ${report.summary.totalTests}
- **Passed**: ${report.summary.passedTests}
- **Failed**: ${report.summary.failedTests}
- **Success Rate**: ${report.summary.successRate.toFixed(1)}%

## 📝 Failed Tests Details
${failedTests.map((test, index) => 
    `${index + 1}. **${test.feature} - ${test.testName}**: ${test.message}`
).join('\n')}`;
    }
}
