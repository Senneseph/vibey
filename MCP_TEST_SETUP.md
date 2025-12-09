# Testing MCP Server with Vibey

## Overview
This document explains how to set up and test MCP (Model Context Protocol) servers with Vibey to ensure proper integration.

## Setting Up a Test MCP Server

### Prerequisites
- Node.js (v16 or higher)
- VS Code with Vibey extension installed

### Steps

1. **Install the test MCP server dependencies**:
   ```bash
   cd test-mcp
   npm install
   ```

2. **Run the test MCP server**:
   ```bash
   npm start
   ```

3. **Configure Vibey to use the test server**:
   - Open Vibey Settings in VS Code
   - Navigate to "Vibey: MCP Servers"
   - Add a new server with the following configuration:
     ```json
     {
       "command": "node",
       "args": ["/path/to/test-mcp/test-mcp-server.js"]
     }
     ```

## Improving the Settings Interface

Currently, Vibey's MCP server configuration uses VS Code's built-in JSON editor which is not user-friendly. We need to create a better UI for managing MCP servers.

### Current Issues
- JSON editing is error-prone
- No validation or guidance
- Difficult to add/remove servers

### Proposed Improvements

1. **Custom Settings Panel**:
   - Create a dedicated panel in Vibey's sidebar for MCP server management
   - Provide form-based interface for adding/editing servers
   - Include validation and error handling

2. **Server Management Features**:
   - Add/remove MCP servers
   - Test server connections
   - View server status (connected/disconnected/error)
   - See server capabilities (tools, resources, prompts)

3. **User Experience Enhancements**:
   - Auto-detect available servers
   - Provide templates for common server types
   - Show connection status indicators
   - Clear error messages

### Implementation Plan

1. Create a new webview panel for MCP server management
2. Implement form controls for server configuration
3. Add connection testing functionality
4. Integrate with existing MCP service
5. Update settings UI to include this new panel
