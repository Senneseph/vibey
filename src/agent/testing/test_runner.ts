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
            // Run individual feature tests
            results.push(...await this.testLLMConnectivity());
            results.push(...await this.testFileOperations());
            results.push(...await this.testMCPServer());
            results.push(...await this.testWebFetching());
            results.push(...await this.testTerminalOperations());

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
                await writeTool.execute({ path: testFilePath, content: testContent });
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
                const fileContent = await readTool.execute({ path: testFilePath });
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
            // Test 1: Check if MCP servers are configured
            const config = vscode.workspace.getConfiguration('vibey');
            const mcpServers = config.get<Record<string, any>>('mcpServers') || {};
            
            if (Object.keys(mcpServers).length === 0) {
                results.push({
                    feature: 'MCP Server',
                    testName: 'Configuration Check',
                    success: false,
                    message: 'No MCP servers configured',
                    details: { configuredServers: [] },
                    timestamp: Date.now()
                });
                return results;
            }

            results.push({
                feature: 'MCP Server',
                testName: 'Configuration Check',
                success: true,
                message: `Found ${Object.keys(mcpServers).length} MCP server(s) configured`,
                details: { configuredServers: Object.keys(mcpServers) },
                timestamp: Date.now()
            });

            // Test 2: Check server connection states
            const serverStates = this.mcpService.getServerStates();
            const connectedServers = serverStates.filter(s => s.status === 'connected');
            
            results.push({
                feature: 'MCP Server',
                testName: 'Connection Status',
                success: connectedServers.length > 0,
                message: connectedServers.length > 0 
                    ? `${connectedServers.length} server(s) connected successfully`
                    : 'No MCP servers are currently connected',
                details: {
                    totalServers: serverStates.length,
                    connectedServers: connectedServers.map(s => s.name),
                    disconnectedServers: serverStates.filter(s => s.status !== 'connected').map(s => s.name)
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
                        });
                        
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
                    const terminalList = await listTerminalTool.execute({});
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
