import { vscode } from './vscode_api.js';
import {
    handleSendClick,
    updateSendButtonState,
    getIsProcessing,
    getInputBox
} from './chat_manager.js';

// DOM elements - lazy loaded
let inputBox, sendBtn, attachBtn, settingsBtn, modelsBtn, contextArea, clearLLMStreamBtn;

function initializeEventElements() {
    inputBox = document.getElementById('InputBox');
    sendBtn = document.getElementById('send-btn');
    attachBtn = document.getElementById('attach-btn');
    settingsBtn = document.getElementById('settings-btn');
    modelsBtn = document.getElementById('models-btn');
    contextArea = document.getElementById('context-area');
    clearLLMStreamBtn = document.getElementById('clear-llm-stream');

    // Send button
    if (sendBtn) sendBtn.addEventListener('click', handleSendClick);

    // Input box
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

    if (clearLLMStreamBtn) {
        clearLLMStreamBtn.addEventListener('click', () => {
            const streamContainer = document.getElementById('llm-stream-container');
            if (streamContainer) {
                streamContainer.innerHTML = '<div class="empty-state">LLM stream updates will appear here</div>';
            }
        });
    }
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

// Open voice input panel (keyboard shortcut)
function openVoiceInput() {
    vscode.postMessage({ type: 'voiceInput' });
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter: Send message
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const currentInputBox = getInputBox();
            if (document.activeElement === currentInputBox) {
                e.preventDefault();
                handleSendClick();
            }
        }
        // Escape: Stop processing
        if (e.key === 'Escape' && getIsProcessing()) {
            e.preventDefault();
            handleSendClick();
        }
    });
}

// Export for use in other modules
export { 
    initializeEventElements,
    setupTabs, 
    setupKeyboardShortcuts 
};