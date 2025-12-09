# MCP Testing Setup

This document explains how to test MCP (Model Context Protocol) functionality with Vibey.

## Quick Start

1. **Install dependencies**:
   ```bash
   cd test-mcp
   npm install
   ```

2. **Run test server**:
   ```bash
   npm start
   ```

3. **Configure Vibey**:
   - Open VS Code
   - Go to Vibey Settings
   - Add an MCP server with:
     ```json
     {
       "command": "node",
       "args": ["/path/to/test-mcp/test-mcp-server.js"]
     }
     ```

## Testing MCP Integration

After configuring the test server:

1. Use the "Vibey: Reload MCP Servers" command
2. Check the "Vibey: MCP Server Status" command
3. Use the test tool from the chat interface

## Improving Settings UI

The current JSON-based configuration is not user-friendly. We need to implement a custom settings panel that:

- Provides a form-based interface
- Validates server configurations
- Shows connection status
- Allows easy addition/removal of servers

This will be implemented as part of the 0.4.5 release.