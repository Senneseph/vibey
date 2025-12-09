import * as vscode from 'vscode';

export class MicPanel {
    private static currentPanel: MicPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private onTranscriptCallback: ((text: string) => void) | undefined;

    public static createOrShow(
        extensionUri: vscode.Uri,
        onTranscript: (text: string) => void
    ): MicPanel {
        // If we already have a panel, show it
        if (MicPanel.currentPanel) {
            MicPanel.currentPanel.panel.reveal(vscode.ViewColumn.Two);
            MicPanel.currentPanel.onTranscriptCallback = onTranscript;
            return MicPanel.currentPanel;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            'vibeyMic',
            '🎤 Vibey Voice Input',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        MicPanel.currentPanel = new MicPanel(panel, extensionUri, onTranscript);
        return MicPanel.currentPanel;
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        onTranscript: (text: string) => void
    ) {
        this.panel = panel;
        this.onTranscriptCallback = onTranscript;

        // Set the webview's HTML content
        this.panel.webview.html = this.getHtmlContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            (message) => {
                switch (message.type) {
                    case 'transcript':
                        if (this.onTranscriptCallback && message.text) {
                            this.onTranscriptCallback(message.text);
                        }
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`Voice Input Error: ${message.message}`);
                        break;
                    case 'status':
                        console.log('Mic status:', message.message);
                        break;
                    case 'close':
                        this.dispose();
                        break;
                }
            },
            null,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public dispose() {
        MicPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private getHtmlContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vibey Voice Input</title>
    <style>
        body {
            font-family: var(--vscode-font-family, system-ui);
            padding: 20px;
            text-align: center;
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #fff);
        }
        .mic-container { margin: 40px auto; }
        .mic-btn {
            width: 120px; height: 120px;
            border-radius: 50%;
            border: none;
            font-size: 48px;
            cursor: pointer;
            background: #333;
            transition: all 0.3s;
        }
        .mic-btn:hover { background: #444; }
        .mic-btn.listening {
            background: #e74c3c;
            animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        .status { margin: 20px 0; font-size: 14px; color: #888; }
        .transcript {
            margin: 20px;
            padding: 15px;
            background: #2d2d2d;
            border-radius: 8px;
            min-height: 60px;
            text-align: left;
        }
        .transcript-label { font-size: 12px; color: #888; margin-bottom: 8px; }
        .transcript-text { font-size: 16px; line-height: 1.5; }
        .interim { color: #888; font-style: italic; }
        .actions { margin-top: 20px; }
        .actions button {
            padding: 10px 20px;
            margin: 5px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .send-btn { background: #007acc; color: white; }
        .send-btn:hover { background: #005a9e; }
        .cancel-btn { background: #444; color: white; }
        .cancel-btn:hover { background: #555; }
        .error { color: #e74c3c; margin: 10px 0; }
        .instructions { font-size: 12px; color: #666; margin-top: 30px; }
    </style>
</head>
<body>
    <h2>🎤 Voice Input</h2>
    
    <div class="mic-container">
        <button id="micBtn" class="mic-btn">🎤</button>
    </div>
    
    <div id="status" class="status">Click the microphone to start</div>
    <div id="error" class="error" style="display:none;"></div>
    
    <div class="transcript">
        <div class="transcript-label">Transcript:</div>
        <div id="transcriptText" class="transcript-text">
            <span id="finalText"></span>
            <span id="interimText" class="interim"></span>
        </div>
    </div>
    
    <div class="actions">
        <button id="sendBtn" class="send-btn" disabled>Send to Chat</button>
        <button id="cancelBtn" class="cancel-btn">Cancel</button>
    </div>
    
    <div class="instructions">
        Click the mic button to start/stop recording.<br>
        Your speech will be transcribed in real-time.
    </div>

    <script>
        const vscodeApi = acquireVsCodeApi();
        const micBtn = document.getElementById('micBtn');
        const status = document.getElementById('status');
        const errorDiv = document.getElementById('error');
        const finalText = document.getElementById('finalText');
        const interimText = document.getElementById('interimText');
        const sendBtn = document.getElementById('sendBtn');
        const cancelBtn = document.getElementById('cancelBtn');

        let isListening = false;
        let recognition = null;
        let fullTranscript = '';

        // Check for speech recognition support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            status.textContent = 'Speech recognition not supported';
            errorDiv.textContent = 'Your browser does not support the Web Speech API.';
            errorDiv.style.display = 'block';
            micBtn.disabled = true;
        }

        async function requestMicPermission() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                // Stop the stream immediately - we just needed permission
                stream.getTracks().forEach(track => track.stop());
                return true;
            } catch (err) {
                errorDiv.textContent = 'Microphone access denied: ' + err.message;
                errorDiv.style.display = 'block';
                vscodeApi.postMessage({ type: 'error', message: err.message });
                return false;
            }
        }

        async function toggleListening() {
            if (isListening) {
                stopListening();
            } else {
                await startListening();
            }
        }

        async function startListening() {
            errorDiv.style.display = 'none';
            
            // Request mic permission first
            const hasPermission = await requestMicPermission();
            if (!hasPermission) return;

            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                isListening = true;
                micBtn.classList.add('listening');
                status.textContent = 'Listening... Speak now';
                vscodeApi.postMessage({ type: 'status', message: 'listening' });
            };

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        final += result[0].transcript + ' ';
                    } else {
                        interim += result[0].transcript;
                    }
                }
                
                if (final) {
                    fullTranscript += final;
                    finalText.textContent = fullTranscript;
                    sendBtn.disabled = false;
                }
                interimText.textContent = interim;
            };

            recognition.onerror = (event) => {
                if (event.error !== 'no-speech') {
                    errorDiv.textContent = 'Recognition error: ' + event.error;
                    errorDiv.style.display = 'block';
                    vscodeApi.postMessage({ type: 'error', message: event.error });
                }
            };

            recognition.onend = () => {
                if (isListening) {
                    // Restart if we're still supposed to be listening
                    try { recognition.start(); } catch (e) {}
                } else {
                    micBtn.classList.remove('listening');
                    status.textContent = fullTranscript 
                        ? 'Recording stopped. Click Send or speak more.' 
                        : 'Click the microphone to start';
                }
            };

            try {
                recognition.start();
            } catch (err) {
                errorDiv.textContent = 'Failed to start: ' + err.message;
                errorDiv.style.display = 'block';
            }
        }

        function stopListening() {
            isListening = false;
            if (recognition) {
                recognition.stop();
                recognition = null;
            }
            micBtn.classList.remove('listening');
            status.textContent = fullTranscript 
                ? 'Recording stopped. Click Send or speak more.' 
                : 'Click the microphone to start';
        }

        function sendTranscript() {
            if (fullTranscript.trim()) {
                vscodeApi.postMessage({ type: 'transcript', text: fullTranscript.trim() });
                vscodeApi.postMessage({ type: 'close' });
            }
        }

        function cancel() {
            stopListening();
            vscodeApi.postMessage({ type: 'close' });
        }

        micBtn.addEventListener('click', toggleListening);
        sendBtn.addEventListener('click', sendTranscript);
        cancelBtn.addEventListener('click', cancel);

        // Auto-request permission on load
        requestMicPermission();
    </script>
</body>
</html>`;
    }
}

