/*
 * Simple MCP Server for testing Vibey's MCP functionality
 * This server implements basic MCP protocol to test integration
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

// Create a simple server
const server = new Server({
    name: 'TestMCP',
    version: '0.1.0',
}, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        sampling: {},
    },
});

// Register a simple tool
server.registerTool({
    name: 'test-tool',
    description: 'A simple test tool for MCP integration testing',
    inputSchema: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'The message to echo back'
            }
        },
        required: ['message']
    },
    execute: async (params) => {
        return `Echo: ${params.message}`;
    }
});

// Register a simple resource
server.registerResource({
    uri: 'test://example',
    name: 'Example Resource',
    description: 'A test resource for MCP integration',
    mimeType: 'text/plain',
    content: 'This is a test resource content'
});

// Register a simple prompt
server.registerPrompt({
    name: 'test-prompt',
    description: 'A test prompt for MCP integration',
    arguments: [
        {
            name: 'name',
            description: 'Name to greet',
            required: true
        }
    ],
    content: 'Hello, {name}! This is a test prompt.'
});

// Connect the server to stdin/stdout
const transport = new StdioServerTransport();
server.connect(transport);

console.log('Test MCP server started');