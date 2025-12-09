const vscode = acquireVsCodeApi();
const micBtn = document.getElementById('mic-btn');
const inputBox = document.getElementById('InputBox');

// Voice recognition state
let recognition;
let isListening = false;

// Handle voice input events
function handleVoiceInputStarted() {
    // Update UI to show listening state
    micBtn.classList.add('listening');
}

function handleVoiceInputReceived(text) {
    // Add the voice transcript to the input box
    if (text) {
        inputBox.value += (inputBox.value ? ' ' : '') + text;
        inputBox.focus();
        updateSendButtonState();
    }
    micBtn.classList.remove('listening');
}

function handleVoiceInputError(message) {
    // Show error to user
    console.error('Voice input error:', message);
    micBtn.classList.remove('listening');
    if (message) {
        vscode.postMessage({
            type: 'error',
            message: `Voice input error: ${message}`
        });
    }
}

// Export for use in other modules
export { 
    handleVoiceInputStarted, 
    handleVoiceInputReceived, 
    handleVoiceInputError 
};