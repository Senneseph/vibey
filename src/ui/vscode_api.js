// Shared VSCode API instance - must only be acquired once
// This file is loaded as a script in the HTML and also imported by modules
// The global variable ensures it's only acquired once even with multiple imports

// Check if vscode is already defined globally
if (typeof window.vscodeApi === 'undefined') {
    window.vscodeApi = acquireVsCodeApi();
}

// Export for module imports
const vscode = window.vscodeApi;
export { vscode };
