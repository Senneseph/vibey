// Main entry point that imports and initializes all modules

// Import all modules
import { vscode } from './vscode_api.js';
import { applyTheme, initThemeManager } from './theme_manager.js';
import { renderMessage, handleAgentUpdate } from './message_renderer.js';
import {
    initializeDOMElements,
    getChatContainer,
    contextFiles,
    handleSendClick,
    sendMessage,
    setProcessing,
    updateSendButtonState,
    renderContext
} from './chat_manager.js';
import {
    allTasks,
    setAllTasks,
    filterAndRenderTasks
} from './task_manager.js';
import {
    setupTabs,
    setupKeyboardShortcuts,
    initializeEventElements
} from './events.js';


// Initialize the application
function initApp() {
    // Initialize DOM elements first
    initializeDOMElements();
    initializeEventElements();
    // Initialize theme manager
    initThemeManager();
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
            console.log('[VIBEY][Webview] restoreHistory received:', message);
            // Clear existing messages and restore from history
            const chatContainer = getChatContainer();
            if (chatContainer) {
                chatContainer.innerHTML = '';
            }
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
            } else {
                console.log('[VIBEY][Webview] No messages in restoreHistory payload.');
            }

            // Scroll to bottom after restoring
            if (chatContainer && chatContainer.scrollHeight > 0) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            break;
        case 'restoreState':
            if (message.busy) {
                setProcessing(true);
            }
            break;
        case 'addMessage':
            renderMessage(message.role, message.content, message.timestamp);
            const container = getChatContainer();
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
            break;
        case 'requestStopped':
            setProcessing(false, true);  // false for processing, true for resumable
            updateSendButtonState();
            break;
        case 'requestComplete':
            setProcessing(false, false);  // false for both processing and resumable
            updateSendButtonState();
            break;
        case 'appendContext':
            contextFiles.push(message.file);
            renderContext();
            break;
        case 'updateTasks':
            setAllTasks(message.tasks || []);
            filterAndRenderTasks();
            break;
        case 'agentUpdate':
            handleAgentUpdate(message.update);
            break;

    }
});

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}