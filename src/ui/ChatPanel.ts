import * as vscode from 'vscode';
import { AgentOrchestrator } from '../agent/orchestrator';

import { TaskManager } from '../agent/task_manager';
import { HistoryManager } from '../agent/history_manager';

export class ChatPanel implements vscode.WebviewViewProvider {

    public static readonly viewType = 'vibey.chatView';
    private _view?: vscode.WebviewView;


    private currentHistory: { role: string; content: string }[] = [];
    private isGenerating: boolean = false;
    private webviewReady: boolean = false;
    private ongoingAgentProcess: { cancel: () => void; reconnect: (onUpdate: (update: any) => void) => void } | null = null;
    private lastAgentUpdate: any = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly orchestrator: AgentOrchestrator,
        private readonly taskManager: TaskManager,
        private readonly historyManager: HistoryManager
    ) { }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Pre-load history before setting HTML
        this.currentHistory = await this.historyManager.loadHistory();

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Set up message handling
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewReady': {
                    // Webview has loaded and is ready to receive messages
                    this.webviewReady = true;

                    // Restore History
                    if (this.currentHistory.length > 0) {
                        this._view?.webview.postMessage({
                            type: 'restoreHistory',
                            messages: this.currentHistory
                        });
                    }

                    // Restore State (if mid-generation)
                    if (this.isGenerating) {
                        this._view?.webview.postMessage({ type: 'restoreState', busy: true });
                        // Restore last agent update if available
                        if (this.lastAgentUpdate) {
                            this._view?.webview.postMessage({ type: 'agentUpdate', update: this.lastAgentUpdate });
                        }
                        // Reconnect to ongoing agent process to resume streaming updates
                        if (this.ongoingAgentProcess) {
                            this.ongoingAgentProcess.reconnect((update: any) => {
                                this.lastAgentUpdate = update;
                                if (this.webviewReady) {
                                    this._view?.webview.postMessage({ type: 'agentUpdate', update });
                                }
                            });
                        }
                    }
                    break;
                }
                case 'sendMessage': {
                    if (!data.text) return;

                    // 1. Add User Message & Save Immediately
                    const userMsg = { role: 'user', content: data.text };
                    this.currentHistory.push(userMsg);

                    // Only send to UI if webview is ready
                    if (this.webviewReady) {
                        this._view?.webview.postMessage({ type: 'addMessage', role: userMsg.role, content: userMsg.content });
                    }

                    await this.historyManager.saveHistory(this.currentHistory);

                    this.isGenerating = true;

                    // Call Agent with Context (Pass data.context)
                    let agentCancelled = false;
                    try {
                        // Track the agent process for reconnection
                        let updateCallback = (update: any) => {
                            this.lastAgentUpdate = update;
                            if (this.webviewReady) {
                                this._view?.webview.postMessage({ type: 'agentUpdate', update });
                            }
                        };

                        // Wrap the orchestrator call so we can reconnect later
                        let reconnect = (cb: (update: any) => void) => {
                            updateCallback = cb;
                        };
                        this.ongoingAgentProcess = {
                            cancel: () => { agentCancelled = true; this.orchestrator.cancel(); },
                            reconnect
                        };

                        const response = await this.orchestrator.chat(data.text, data.context, (update: any) => {
                            if (!agentCancelled) updateCallback(update);
                        });

                        if (this.webviewReady) {
                            this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: response });
                        }

                        // 2. Add Assistant Message & Save
                        this.currentHistory.push({ role: 'assistant', content: response });
                        await this.historyManager.saveHistory(this.currentHistory);

                        if (response !== 'Request cancelled.') {
                            if (this.webviewReady) {
                                this._view?.webview.postMessage({ type: 'requestComplete' });
                            }
                        }
                    } catch (e: any) {
                        if (this.webviewReady) {
                            this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `Error: ${e.message}` });
                        }
                        if (this.webviewReady) {
                            this._view?.webview.postMessage({ type: 'requestComplete' }); // Even on error we are done
                        }
                    } finally {
                        this.isGenerating = false;
                        this.ongoingAgentProcess = null;
                        this.lastAgentUpdate = null;
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
                            if (this.webviewReady) {
                                webviewView.webview.postMessage({
                                    type: 'appendContext',
                                    file: { name: uri.path.split('/').pop(), path: uri.fsPath }
                                });
                            }
                        });
                    }
                    break;
                }


                case 'stopRequest': {
                    this.orchestrator.cancel();
                    if (this.webviewReady) {
                        webviewView.webview.postMessage({ type: 'requestStopped' });
                    }
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
                    if (this.webviewReady) {
                        webviewView.webview.postMessage({ type: 'updateTasks', tasks: tasks });
                    }
                    break;
                }
                case 'error': {
                    vscode.window.showErrorMessage(data.message);
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
