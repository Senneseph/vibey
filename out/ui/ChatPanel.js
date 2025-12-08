"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
const vscode = require("vscode");
class ChatPanel {
    constructor(_extensionUri, orchestrator, taskManager) {
        this._extensionUri = _extensionUri;
        this.orchestrator = orchestrator;
        this.taskManager = taskManager;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage': {
                    if (!data.text)
                        return;
                    // Respond immediately (echo)
                    webviewView.webview.postMessage({ type: 'addMessage', role: 'user', content: data.text });
                    // Call Agent with Context (Pass data.context)
                    try {
                        const onUpdate = (update) => {
                            webviewView.webview.postMessage({ type: 'agentUpdate', update });
                        };
                        // We will update orchestrator to accept onUpdate
                        const response = await this.orchestrator.chat(data.text, data.context, onUpdate);
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: response });
                    }
                    catch (e) {
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `Error: ${e.message}` });
                    }
                    break;
                }
                case 'openSettings': {
                    vscode.commands.executeCommand('vibey.openSettings');
                    break;
                }
                case 'selectContext': {
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: true,
                        openLabel: 'Add to Context'
                    });
                    if (uris) {
                        uris.forEach(uri => {
                            webviewView.webview.postMessage({
                                type: 'appendContext',
                                file: { name: uri.path.split('/').pop(), path: uri.fsPath }
                            });
                        });
                    }
                    break;
                }
                case 'selectModel': {
                    vscode.commands.executeCommand('vibey.selectModel');
                    break;
                }
                case 'getTasks': {
                    const tasks = this.taskManager.listTasks();
                    webviewView.webview.postMessage({ type: 'updateTasks', tasks: tasks });
                    break;
                }
                case 'error': {
                    vscode.window.showErrorMessage(data.message);
                    break;
                }
            }
        });
    }
    _getHtmlForWebview(webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'media', 'main.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'media', 'main.css'));
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <title>Vibey Chat</title>
        </head>
        <body>
            <div class="tabs">
                <div class="tab active" data-tab="chat">Chat</div>
                <div class="tab" data-tab="tasks">Tasks</div>
            </div>

            <div id="chat-view" class="view active">
                <div id="chat-container"></div>

                <div id="input-area">
                    <div id="context-area"></div>
                    
                    <div class="input-container">
                        <textarea id="InputBox" placeholder="Ask Vibey... (Shift+Enter for new line)"></textarea>
                        
                        <div class="input-actions">
                            <div class="toolbar">
                                <button id="attach-btn" class="icon-btn" title="Add Context">📎</button>
                                <button id="mic-btn" class="icon-btn" title="Voice Input">🎤</button>
                                <button id="models-btn" class="icon-btn" title="Select Model">🤖</button>
                                <button id="settings-btn" class="icon-btn" title="Settings">⚙️</button>
                            </div>
                            <button id="send-btn">Send ➤</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="tasks-view" class="view">
                <div id="task-list">
                    <!-- Tasks will be rendered here -->
                    <div class="empty-state">No active tasks. Ask Vibey to start a task!</div>
                </div>
            </div>

            <script src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
exports.ChatPanel = ChatPanel;
ChatPanel.viewType = 'vibey.chatView';
//# sourceMappingURL=ChatPanel.js.map