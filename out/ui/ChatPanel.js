"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatPanel = void 0;
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
                    // Call Agent
                    try {
                        const response = await this.orchestrator.chat(data.text);
                        // In a real app we'd stream this or handle tool outputs piece by piece.
                        // Here we just send the final answer.
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: response });
                    }
                    catch (e) {
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `Error: ${e.message}` });
                    }
                    break;
                }
            }
        });
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vibey Chat</title>
             <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-editor-foreground); }
                .message { margin-bottom: 10px; padding: 5px; border-radius: 4px; }
                .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
                .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-widget-border); }
                #chat { display: flex; flex-direction: column; height: 300px; overflow-y: auto; margin-bottom: 10px; }
                #input { width: 100%; padding: 5px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); }
            </style>
        </head>
        <body>
            <h3>Vibey Agent</h3>
            <div id="chat"></div>
            <textarea id="input" rows="3" placeholder="Ask me to do something... (ctrl+enter to send)"></textarea>
            <script>
                const vscode = acquireVsCodeApi();
                const chat = document.getElementById('chat');
                const input = document.getElementById('input');

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                        const text = input.value;
                        if(text) {
                            vscode.postMessage({ type: 'sendMessage', text: text });
                            input.value = '';
                        }
                    }
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'addMessage':
                            const div = document.createElement('div');
                            div.className = 'message ' + message.role;
                            div.textContent = message.role.toUpperCase() + ": " + message.content;
                            chat.appendChild(div);
                            chat.scrollTop = chat.scrollHeight;
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
exports.ChatPanel = ChatPanel;
ChatPanel.viewType = 'vibey.chatView';
//# sourceMappingURL=ChatPanel.js.map