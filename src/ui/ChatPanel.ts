import * as vscode from 'vscode';
import { AgentOrchestrator } from '../agent/orchestrator';

import { TaskManager } from '../agent/task_manager';
import { DailyHistoryManager } from '../agent/daily_history_manager';

export class ChatPanel implements vscode.WebviewViewProvider {

    public static readonly viewType = 'vibey.chatView';
    private _view?: vscode.WebviewView;


    private currentHistory: { role: string; content: string; agentUpdates?: any[] }[] = [];
    private isGenerating: boolean = false;
    private webviewReady: boolean = false;
    private ongoingAgentProcess: { cancel: () => void; reconnect: (onUpdate: (update: any) => void) => void } | null = null;
    private lastAgentUpdate: any = null;
    private agentUpdatesBuffer: any[] = [];
    private pendingAgentUpdates: any[] = [];  // Accumulate updates for current assistant response

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly orchestrator: AgentOrchestrator,
        private readonly taskManager: TaskManager,
        private readonly historyManager: DailyHistoryManager
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
        console.log('[VIBEY][ChatPanel] Loaded history:', this.currentHistory);

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Set up message handling
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'webviewReady': {
                    // Webview has loaded and is ready to receive messages
                    this.webviewReady = true;

                    // Restore History
                    console.log('[VIBEY][ChatPanel] webviewReady received. History:', this.currentHistory);
                    if (this.currentHistory.length > 0) {
                        console.log('[VIBEY][ChatPanel] Posting restoreHistory to webview:', this.currentHistory);
                        this._view?.webview.postMessage({
                            type: 'restoreHistory',
                            messages: this.currentHistory
                        });
                    } else {
                        console.log('[VIBEY][ChatPanel] No history to restore.');
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
                                // Also buffer updates for later restoration
                                this.agentUpdatesBuffer.push(update);
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
                    this.agentUpdatesBuffer = []; // Clear buffer for new session
                    this.pendingAgentUpdates = []; // Clear pending updates for new response

                    // Call Agent with Context (Pass data.context)
                    let agentCancelled = false;
                    try {
                        // Track the agent process for reconnection
                        let updateCallback = (update: any) => {
                            this.lastAgentUpdate = update;
                            // Buffer updates for session preservation
                            this.agentUpdatesBuffer.push(update);
                            // Accumulate updates for this response
                            this.pendingAgentUpdates.push(update);
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

                        // 2. Add Assistant Message with agent updates & Save
                        this.currentHistory.push({
                            role: 'assistant',
                            content: response,
                            agentUpdates: [...this.pendingAgentUpdates]  // Save tool executions with the message
                        });
                        await this.historyManager.saveHistory(this.currentHistory);

                        if (response !== 'Request cancelled.') {
                            if (this.webviewReady) {
                                this._view?.webview.postMessage({ type: 'requestComplete' });
                            }
                        }
                    } catch (e: any) {
                        const elapsed = Date.now() - (data.startTime || 0);
                        console.error('[VIBEY][ChatPanel] ❌ Error in chat after', elapsed, 'ms');
                        console.error('[VIBEY][ChatPanel] Error type:', e.constructor.name);
                        console.error('[VIBEY][ChatPanel] Error message:', e.message);
                        console.error('[VIBEY][ChatPanel] Error details:', e);
                        
                        // Diagnose the error
                        if (e.message.includes('fetch') || e.message.includes('Cannot')) {
                            console.error('[VIBEY][ChatPanel] 💡 Diagnosis: Network error - Ollama server may be unreachable');
                            console.error('[VIBEY][ChatPanel] Recommendation: Check Extension Host output for Ollama diagnostics');
                        } else if (e.message.includes('JSON')) {
                            console.error('[VIBEY][ChatPanel] 💡 Diagnosis: Response parsing error - Ollama response is invalid');
                            console.error('[VIBEY][ChatPanel] Recommendation: Model may be crashing, check Ollama logs');
                        } else if (e.message.includes('timeout')) {
                            console.error('[VIBEY][ChatPanel] 💡 Diagnosis: Request timeout - Ollama took too long to respond');
                            console.error('[VIBEY][ChatPanel] Recommendation: Check if model is loaded and Ollama is responsive');
                        }
                        
                        const errorMsg = e.message || 'Unknown error';
                        if (this.webviewReady) {
                            // Send detailed error information to webview
                            this._view?.webview.postMessage({
                                type: 'llmError',
                                error: errorMsg,
                                source: e.stack ? e.stack.split('\n')[0] : 'Unknown',
                                duration: elapsed
                            });
                            this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `**Error:** ${errorMsg}` });
                        }
                        if (this.webviewReady) {
                            this._view?.webview.postMessage({ type: 'requestComplete' }); // Even on error we are done
                        }
                    } finally {
                        this.isGenerating = false;
                        this.ongoingAgentProcess = null;
                        this.lastAgentUpdate = null;
                        // Save session after completion
                        await this.historyManager.saveSession(this.currentHistory);
                    }
                    break;
                }
                case 'openSettings': {
                    vscode.commands.executeCommand('vibey.openSettings');
                    break;
                }
                case 'selectModel': {
                    vscode.commands.executeCommand('vibey.selectModel');
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
                case 'voiceInput': {
                    // Handle voice input request from webview
                    this.handleVoiceInput().catch(error => {
                        console.error('Voice input error:', error);
                        if (this.webviewReady) {
                            this._view?.webview.postMessage({
                                type: 'voiceInputError',
                                message: error.message || 'Failed to process voice input'
                            });
                        }
                    });
                    break;
                }
                case 'requestContext': {
                    // Handle requests for additional context from the agent
                    if (data.contextKey && this.webviewReady) {
                        // This would be where we could request specific context from the agent
                        // For now, we'll just show a notification
                        vscode.window.showInformationMessage(`Agent requested context: ${data.contextKey}`);
                    }
                    break;
                }
            }
        });
    }

    private async handleVoiceInput() {
        // Voice input now uses MicPanel (separate WebviewPanel with mic permissions)
        // Trigger the voiceInput command which opens the MicPanel
        vscode.commands.executeCommand('vibey.voiceInput');
    }

    /**
     * Add transcribed text to the chat input box
     * Called from MicPanel when user sends their voice transcript
     */
    public addTranscriptToInput(text: string) {
        if (this.webviewReady && text) {
            this._view?.webview.postMessage({
                type: 'voiceInputReceived',
                text: text
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'media', 'main.js'));
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vibey Chat</title>
            <link rel="stylesheet" href="${webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'media', 'main.css'))}">
        </head>
        <body>
            <div class="tabs">
                <div class="tab active" data-tab="chat">Chat</div>
                <div class="tab" data-tab="tasks">Tasks</div>
                <div class="tab" data-tab="llm-stream">LLM Stream</div>
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

            <div id="llm-stream-view" class="view">
                <div id="llm-stream-container">
                    <!-- LLM stream updates will be rendered here -->
                    <div class="empty-state">LLM stream updates will appear here</div>
                </div>
            </div>

            <script type="module" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
