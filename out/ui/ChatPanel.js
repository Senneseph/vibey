"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
const vscode = __importStar(require("vscode"));
class ChatPanel {
    constructor(_extensionUri, orchestrator, taskManager, historyManager) {
        this._extensionUri = _extensionUri;
        this.orchestrator = orchestrator;
        this.taskManager = taskManager;
        this.historyManager = historyManager;
    }
    async resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Restore History
        const history = await this.historyManager.loadHistory();
        if (history.length > 0) {
            history.forEach(msg => {
                webviewView.webview.postMessage({ type: 'addMessage', role: msg.role, content: msg.content });
            });
        }
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
                        // Save History
                        const newHistory = await this.historyManager.loadHistory();
                        newHistory.push({ role: 'user', content: data.text });
                        newHistory.push({ role: 'assistant', content: response });
                        await this.historyManager.saveHistory(newHistory);
                        if (response !== 'Request cancelled.') {
                            webviewView.webview.postMessage({ type: 'requestComplete' });
                        }
                    }
                    catch (e) {
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `Error: ${e.message}` });
                        webviewView.webview.postMessage({ type: 'requestComplete' }); // Even on error we are done
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
                case 'stopRequest': {
                    this.orchestrator.cancel();
                    webviewView.webview.postMessage({ type: 'requestStopped' });
                    break;
                }
                case 'retryRequest': {
                    // Retry Logic (Resend last user message)
                    // We need access to history or just rely on state. 
                    // Ideally the Orchestrator exposes a retry method, or we just rely on client to resend text.
                    // Simpler: Just rely on client to send text again or we re-trigger.
                    // Actually, if we just cancelled, we might want to "resume" or "restart" the last generation.
                    // For now, let's treat "resume" as "please try that last message again".
                    // But "retryRequest" implies the client knows what to retry? 
                    // Or the client sends the text again.
                    // Let's assume the client sends the text again for "sendMessage".
                    // If "resume", we might need to tell the Orchestrator to "continue".
                    // BUT, "Retry" usually means "Do it again". 
                    // Let's implement 'stopRequest' here. 'retryRequest' isn't needed if we reuse 'sendMessage' from client.
                    // Wait, the client button becomes "Resume". If clicked, it should probably just re-send the last input?
                    // No, UI should handle that? 
                    // Let's just handle stopRequest first.
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