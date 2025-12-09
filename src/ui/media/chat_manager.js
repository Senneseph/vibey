const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');

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
    } else if (isResumable && !inputBox.value.trim()) {
        sendBtn.textContent = 'Resume ↺';
        sendBtn.className = 'resume';
        sendBtn.title = 'Resume Request';
    } else {
        sendBtn.textContent = 'Send ➤';
        sendBtn.className = '';
        sendBtn.title = 'Send Message';
    }
}

function setProcessing(processing) {
    isProcessing = processing;
    isResumable = false; // Reset resume state when new request starts
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
    const text = inputBox.value.trim();
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

    inputBox.value = '';
    contextFiles = [];
    renderContext();
}

// Export for use in other modules
export { 
    contextFiles, 
    handleSendClick, 
    sendMessage, 
    setProcessing, 
    updateSendButtonState, 
    renderContext 
};