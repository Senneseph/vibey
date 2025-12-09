#!/bin/bash

# Setup script for test MCP server

echo "Setting up test MCP server..."

# Create directory for test server
mkdir -p test-mcp

cd test-mcp

# Initialize npm project
npm init -y

# Install MCP SDK
npm install @modelcontextprotocol/sdk

# Copy test server file
cp ../test-mcp-server.js .

echo "Test MCP server setup complete!"
echo "To run: npm start"
