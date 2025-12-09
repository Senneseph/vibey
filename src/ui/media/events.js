const vscode = acquireVsCodeApi();
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const micBtn = document.getElementById('mic-btn');
const settingsBtn = document.getElementById('settings-btn');
const modelsBtn = document.getElementById('models-btn');
const contextArea = document.getElementById('context-area');

// Mic button opens a separate WebviewPanel with proper mic permissions
if (micBtn) {
    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Request the extension to open the MicPanel
        vscode.postMessage({ type: 'voiceInput' });
    });
}

// Open voice input panel (keyboard shortcut)
function openVoiceInput() {
    vscode.postMessage({ type: 'voiceInput' });
}

// Events
if (sendBtn) sendBtn.addEventListener('click', handleSendClick);

if (inputBox) {
    inputBox.addEventListener('input', () => {
        // If user types, we leave "Resume" state and go to "Send" state
        updateSendButtonState();
    });

    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Enter always attempts to send or resume
            handleSendClick();
        }
    });
}

if (attachBtn) {
    attachBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectContext' });
    });
}

// Note: micBtn uses push-to-talk (mousedown/mouseup) handlers set up in voiceService initialization

if (modelsBtn) {
    modelsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectModel' });
    });
}

if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });
}

// Tabs
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

            // Activate current
            tab.classList.add('active');
            const viewId = tab.dataset.tab + '-view';
            const view = document.getElementById(viewId);
            if (view) view.classList.add('active');

            if (tab.dataset.tab === 'tasks') {
                vscode.postMessage({ type: 'getTasks' });
            }
        });
    });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter: Send message
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (document.activeElement === inputBox) {
                e.preventDefault();
                handleSendClick();
            }
        }
        // Ctrl/Cmd + Shift + M: Open voice input
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
            e.preventDefault();
            openVoiceInput();
        }
        // Escape: Stop processing
        if (e.key === 'Escape' && isProcessing) {
            e.preventDefault();
            handleSendClick();
        }
    });
}

// Export for use in other modules
export { 
    openVoiceInput, 
    setupTabs, 
    setupKeyboardShortcuts 
};