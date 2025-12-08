"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
const vscode = require("vscode");
class ChatPanel {
    constructor(_extensionUri, orchestrator) {
        this._extensionUri = _extensionUri;
        this.orchestrator = orchestrator;
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
                        const response = await this.orchestrator.chat(data.text, data.context);
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
            <div id="chat-container"></div>
            
            <div id="input-area">
                <div id="context-area"></div>
                <textarea id="InputBox" placeholder="Ask Vibey... (Shift+Enter for new line)"></textarea>

                <div class="controls">
                    <div class="toolbar">
                        <button id="attach-btn" title="Add Context">📎</button>
                        <button id="mic-btn" title="Voice Input">🎤</button>
                        <button id="models-btn" title="Select Model">🤖</button>
                        <button id="settings-btn" title="Settings">⚙️</button>
                    </div>
                    <button id="send-btn" class="primary">Send ➤</button>
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