// Main entry point that imports and initializes all modules

// Import all modules
import { applyTheme } from './theme_manager.js';
import { renderMessage, handleAgentUpdate } from './message_renderer.js';
import { 
    contextFiles, 
    handleSendClick, 
    sendMessage, 
    setProcessing, 
    updateSendButtonState, 
    renderContext 
} from './chat_manager.js';
import { 
    allTasks, 
    taskFilters, 
    renderTasks, 
    filterAndRenderTasks, 
    updateTaskFilter 
} from './task_manager.js';
import { 
    openVoiceInput, 
    setupTabs, 
    setupKeyboardShortcuts 
} from './events.js';
import { 
    handleVoiceInputStarted, 
    handleVoiceInputReceived, 
    handleVoiceInputError 
} from './voice_input.js';

// Initialize the application
function initApp() {
    // Setup tabs and keyboard shortcuts
    setupTabs();
    setupKeyboardShortcuts();
    
    // Signal to extension that webview is ready to receive messages
    vscode.postMessage({ type: 'webviewReady' });
}

// Global error handler
window.onerror = function (message, source, lineno, colno, error) {
    vscode.postMessage({
        type: 'error',
        message: `UI Error: ${message}`
    });
};

// Incoming Messages
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'restoreHistory':
            // Clear existing messages and restore from history
            chatContainer.innerHTML = '';
            if (message.messages && Array.isArray(message.messages)) {
                message.messages.forEach(msg => {
                    // Restore agent updates (tool calls, thoughts) before the message
                    if (msg.agentUpdates && Array.isArray(msg.agentUpdates)) {
                        msg.agentUpdates.forEach(update => {
                            handleAgentUpdate(update);
                        });
                    }
                    renderMessage(msg.role, msg.content);
                });
            }

            // Scroll to bottom after restoring
            chatContainer.scrollTop = chatContainer.scrollHeight;
            break;
        case 'restoreState':
            if (message.busy) {
                setProcessing(true);
            }
            break;
        case 'addMessage':
            renderMessage(message.role, message.content, message.timestamp);
            chatContainer.scrollTop = chatContainer.scrollHeight;
            break;
        case 'requestStopped':
            isProcessing = false;
            isResumable = true;
            updateSendButtonState();
            break;
        case 'requestComplete':
            isProcessing = false;
            isResumable = false;
            updateSendButtonState();
            break;
        case 'appendContext':
            contextFiles.push(message.file);
            renderContext();
            break;
        case 'updateTasks':
            allTasks = message.tasks || [];
            filterAndRenderTasks();
            break;
        case 'agentUpdate':
            handleAgentUpdate(message.update);
            break;
        case 'voiceInputStarted':
            handleVoiceInputStarted();
            break;
        case 'voiceInputReceived':
            handleVoiceInputReceived(message.text);
            break;
        case 'voiceInputError':
            handleVoiceInputError(message.message);
            break;
    }
});

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}