// Test setup for OpenSpec integration tests
import * as path from 'path';
import * as fs from 'fs';

// Extend global namespace for test utilities
declare global {
  var testWorkspace: string;
  var mockVscode: any;
  var resolveExtensionPath: (relativePath: string) => string;
}

// Mock VS Code API for testing
const mockVscode = {
  workspace: {
    workspaceFolders: [{
      uri: { fsPath: path.join(__dirname, '../../test-workspace') }
    }],
    getConfiguration: jest.fn(() => ({
      get: jest.fn((key: string) => {
        // Return default empty config for mcpServers to allow built-in servers
        if (key === 'mcpServers') {
          return {};
        }
        if (key === 'mcpMarketplaceEnabled') {
          return false; // Disable marketplace in tests
        }
        if (key === 'disableFilesystemServer') {
          return false;
        }
        if (key === 'disableOpenSpecServer') {
          return false;
        }
        return undefined;
      }),
      update: jest.fn()
    })),
    onDidChangeConfiguration: jest.fn(() => ({
      dispose: jest.fn()
    })),
    onDidChangeWorkspaceFolders: jest.fn(() => ({
      dispose: jest.fn()
    }))
  },
  window: {
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn()
  },
  ExtensionContext: jest.fn(),
  Uri: {
    joinPath: jest.fn()
  },
  Disposable: {
    from: jest.fn(() => ({
      dispose: jest.fn()
    }))
  }
};

// Mock the vscode module
jest.mock('vscode', () => mockVscode, { virtual: true });

// Helper function to resolve extension-relative paths correctly
global.resolveExtensionPath = (relativePath: string): string => {
  // Get the project root (parent of src/test/)
  const projectRoot = path.join(__dirname, '../..');
  
  // Handle known built-in server paths
  if (relativePath === 'openspec-server/build/index.js') {
    return path.join(projectRoot, 'openspec-server/build/index.js');
  }
  if (relativePath.startsWith('src/agent/mcp/')) {
    return path.join(projectRoot, relativePath);
  }
  
  // Default: join with project root
  return path.isAbsolute(relativePath) 
    ? relativePath 
    : path.join(projectRoot, relativePath);
};

// Create test workspace directory
const testWorkspace = path.join(__dirname, '../../test-workspace');
if (!fs.existsSync(testWorkspace)) {
  fs.mkdirSync(testWorkspace, { recursive: true });
}

// Global test utilities
global.testWorkspace = testWorkspace;
global.mockVscode = mockVscode;