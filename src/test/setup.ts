// Test setup for OpenSpec integration tests
import * as path from 'path';
import * as fs from 'fs';

// Extend global namespace for test utilities
declare global {
  var testWorkspace: string;
  var mockVscode: any;
}

// Mock VS Code API for testing
const mockVscode = {
  workspace: {
    workspaceFolders: [{
      uri: { fsPath: path.join(__dirname, '../../test-workspace') }
    }],
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
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

// Create test workspace directory
const testWorkspace = path.join(__dirname, '../../test-workspace');
if (!fs.existsSync(testWorkspace)) {
  fs.mkdirSync(testWorkspace, { recursive: true });
}

// Global test utilities
global.testWorkspace = testWorkspace;
global.mockVscode = mockVscode;