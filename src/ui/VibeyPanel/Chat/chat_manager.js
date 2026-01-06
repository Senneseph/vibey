import { vscode } from '../../vscode_api.js';

// DOM elements - lazy loaded to avoid null references
let chatContainer = null;
let inputBox = null;
let sendBtn = null;
let attachBtn = null;
let contextArea = null;

function initializeDOMElements() {
    chatContainer = document.getElementById('chat-container');
    inputBox = document.getElementById('InputBox');
    sendBtn = document.getElementById('send-btn');
    attachBtn = document.getElementById('attach-btn');
    contextArea = document.getElementById('context-area');

    if (!chatContainer || !inputBox || !sendBtn) {
        console.error('Critical DOM elements not found');
    }
}

// Getter for chatContainer (used by other modules)
function getChatContainer() {
    return chatContainer;
}

// Getter for inputBox (used by other modules)
function getInputBox() {
    return inputBox;
}

// State
let contextFiles = [];
let isProcessing = false;
let isResumable = false;
let lastMessageText = '';
let lastContextFiles = [];

function updateSendButtonState() {
    if (isProcessing) {
        sendBtn.textContent = 'Stop 🛑';
        sendBtn.className = 'stop';
        sendBtn.title = 'Stop Request';
    } else if (isResumable && !getInputBoxValue().trim()) {
        sendBtn.textContent = 'Resume ↺';
        sendBtn.className = 'resume';
        sendBtn.title = 'Resume Request';
    } else {
        sendBtn.textContent = 'Send ➤';
        sendBtn.className = '';
        sendBtn.title = 'Send Message';
    }
}

// Helper function to get the value from vscode-text-area
function getInputBoxValue() {
    if (!inputBox) return '';
    
    // For vscode-text-area, we need to access the internal textarea
    const internalTextarea = inputBox.shadowRoot?.querySelector('textarea');
    return internalTextarea ? internalTextarea.value : inputBox.value || '';
}

// Helper function to set the value for vscode-text-area
function setInputBoxValue(value) {
    if (!inputBox) return;
    
    // For vscode-text-area, we need to access the internal textarea
    const internalTextarea = inputBox.shadowRoot?.querySelector('textarea');
    if (internalTextarea) {
        internalTextarea.value = value;
    } else {
        inputBox.value = value;
    }
}

function setProcessing(processing, resumable = false) {
    isProcessing = processing;
    isResumable = resumable;
    updateSendButtonState();
}

function renderContext() {
    contextArea.innerHTML = '';
    contextFiles.forEach((file, index) => {
        const chip = document.createElement('span');
        chip.className = 'context-chip';
        chip.textContent = file.name;
        chip.onclick = () => {
            contextFiles.splice(index, 1);
            renderContext();
        };
        contextArea.appendChild(chip);
    });
}

function handleSendClick() {
    if (isProcessing) {
        // Handle STOP
        vscode.postMessage({ type: 'stopRequest' });
        return;
        sendBtn.textContent = 'Stopping...';
    } else if (isResumable && !inputBox.value.trim()) {
        // Handle RESUME - Trigger retry of last
        // Re-send the last message
        if (lastMessageText || lastContextFiles.length > 0) {
            setProcessing(true);
            vscode.postMessage({
                type: 'sendMessage',
                text: lastMessageText,
                context: lastContextFiles
            });
            // We do NOT clear input or context here because we are re-using 'last' state which is already outside UI buffers.
        } else {
            // Fallback if nothing to resume?
            setProcessing(false);
            isResumable = false;
            updateSendButtonState();
        }
    } else {
        sendMessage();
    }
}

function sendMessage() {
    const text = getInputBoxValue().trim();
    if (!text && contextFiles.length === 0) return;

    // specific for Resume: store these
    lastMessageText = text;
    lastContextFiles = [...contextFiles]; // shallow copy

    setProcessing(true);

    vscode.postMessage({
        type: 'sendMessage',
        text: text,
        context: contextFiles
    });

    setInputBoxValue('');
    contextFiles = [];
    renderContext();
}

// Export for use in other modules
export {
    vscode,
    initializeDOMElements,
    getChatContainer,
    getInputBox,
    contextFiles,
    handleSendClick,
    sendMessage,
    setProcessing,
    updateSendButtonState,
    renderContext,
    isProcessing,
    getInputBoxValue,
    setInputBoxValue
};

// Re-export isProcessing as a getter function for external modules
export function getIsProcessing() {
    return isProcessing;
}