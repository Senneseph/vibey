/**
 * Simple Filesystem MCP Server for testing
 * Provides basic filesystem operations via MCP protocol
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as fsExtra from "fs-extra";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
class FilesystemMCPServer {
    workspaceRoot;
    constructor(workspaceRoot = process.cwd()) {
        this.workspaceRoot = workspaceRoot;
    }
    // Filesystem operations
    async createFile(filePath, content) {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            await fsExtra.ensureDir(path.dirname(fullPath));
            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true, message: `File created: ${filePath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to create file: ${error.message}` };
        }
    }
    async readFile(filePath) {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            return { success: true, content, message: `File read: ${filePath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to read file: ${error.message}` };
        }
    }
    async updateFile(filePath, content) {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            await fs.writeFile(fullPath, content, 'utf-8');
            return { success: true, message: `File updated: ${filePath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to update file: ${error.message}` };
        }
    }
    async deleteFile(filePath) {
        try {
            const fullPath = path.join(this.workspaceRoot, filePath);
            await fs.unlink(fullPath);
            return { success: true, message: `File deleted: ${filePath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to delete file: ${error.message}` };
        }
    }
    async moveFile(sourcePath, destinationPath) {
        try {
            const sourceFullPath = path.join(this.workspaceRoot, sourcePath);
            const destFullPath = path.join(this.workspaceRoot, destinationPath);
            await fsExtra.ensureDir(path.dirname(destFullPath));
            await fs.rename(sourceFullPath, destFullPath);
            return { success: true, message: `File moved: ${sourcePath} -> ${destinationPath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to move file: ${error.message}` };
        }
    }
    async listFiles(directoryPath) {
        try {
            const fullPath = path.join(this.workspaceRoot, directoryPath);
            const files = await fs.readdir(fullPath);
            return { success: true, files, message: `Files listed: ${directoryPath}` };
        }
        catch (error) {
            return { success: false, message: `Failed to list files: ${error.message}` };
        }
    }
}
// Create MCP server instance
const server = new Server({
    name: "filesystem-server",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Initialize Filesystem server
const filesystemServer = new FilesystemMCPServer();
// Define filesystem tools
const tools = [
    {
        name: "filesystem_create_file",
        description: "Create a new file in the filesystem",
        inputSchema: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "Path to the file to create"
                },
                content: {
                    type: "string",
                    description: "Content to write to the file"
                }
            },
            required: ["filePath", "content"]
        }
    },
    {
        name: "filesystem_read_file",
        description: "Read content from a file",
        inputSchema: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "Path to the file to read"
                }
            },
            required: ["filePath"]
        }
    },
    {
        name: "filesystem_update_file",
        description: "Update content of an existing file",
        inputSchema: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "Path to the file to update"
                },
                content: {
                    type: "string",
                    description: "New content for the file"
                }
            },
            required: ["filePath", "content"]
        }
    },
    {
        name: "filesystem_delete_file",
        description: "Delete a file from the filesystem",
        inputSchema: {
            type: "object",
            properties: {
                filePath: {
                    type: "string",
                    description: "Path to the file to delete"
                }
            },
            required: ["filePath"]
        }
    },
    {
        name: "filesystem_move_file",
        description: "Move a file from source to destination",
        inputSchema: {
            type: "object",
            properties: {
                sourcePath: {
                    type: "string",
                    description: "Source path of the file"
                },
                destinationPath: {
                    type: "string",
                    description: "Destination path for the file"
                }
            },
            required: ["sourcePath", "destinationPath"]
        }
    },
    {
        name: "filesystem_list_files",
        description: "List files in a directory",
        inputSchema: {
            type: "object",
            properties: {
                directoryPath: {
                    type: "string",
                    description: "Path to the directory to list"
                }
            },
            required: ["directoryPath"]
        }
    }
];
// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "filesystem_create_file": {
                const { filePath, content } = args;
                const result = await filesystemServer.createFile(filePath, content);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            case "filesystem_read_file": {
                const { filePath } = args;
                const result = await filesystemServer.readFile(filePath);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            case "filesystem_update_file": {
                const { filePath, content } = args;
                const result = await filesystemServer.updateFile(filePath, content);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            case "filesystem_delete_file": {
                const { filePath } = args;
                const result = await filesystemServer.deleteFile(filePath);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            case "filesystem_move_file": {
                const { sourcePath, destinationPath } = args;
                const result = await filesystemServer.moveFile(sourcePath, destinationPath);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            case "filesystem_list_files": {
                const { directoryPath } = args;
                const result = await filesystemServer.listFiles(directoryPath);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result)
                        }
                    ]
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`
                }
            ],
            isError: true
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Filesystem MCP server running on stdio');
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
