
import * as vscode from 'vscode';
import { AgentOrchestrator } from '../agent/orchestrator';
import { TaskManager } from '../agent/task_manager';

export class ChatPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vibey.chatView';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly orchestrator: AgentOrchestrator,
        private readonly taskManager: TaskManager
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage': {
                    if (!data.text) return;

                    // Respond immediately (echo)
                    webviewView.webview.postMessage({ type: 'addMessage', role: 'user', content: data.text });

                    // Call Agent with Context (Pass data.context)
                    try {
                        const onUpdate = (update: any) => {
                            webviewView.webview.postMessage({ type: 'agentUpdate', update });
                        };

                        // We will update orchestrator to accept onUpdate
                        const response = await this.orchestrator.chat(data.text, data.context, onUpdate);
                        webviewView.webview.postMessage({ type: 'addMessage', role: 'assistant', content: response });
                    } catch (e: any) {
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
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
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
