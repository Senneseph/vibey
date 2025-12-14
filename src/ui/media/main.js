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
    console.error(`[VIBEY][Webview] Global error: ${message} at ${source}:${lineno}:${colno}`);
    vscode.postMessage({
        type: 'error',
        message: `UI Error: ${message}`,
        source,
        lineno,
        colno
    });
};

// Also catch unhandled promise rejections
window.addEventListener('unhandledrejection', event => {
    console.error('[VIBEY][Webview] Unhandled promise rejection:', event.reason);
    vscode.postMessage({
        type: 'error',
        message: `Unhandled error: ${event.reason?.message || event.reason}`
    });
});

// Scroll to bottom button
let scrollToBottomButton = null;

// Create scroll to bottom button
function createScrollToBottomButton() {
    if (scrollToBottomButton) return;
    
    scrollToBottomButton = document.createElement('button');
    scrollToBottomButton.id = 'scroll-to-bottom';
    scrollToBottomButton.className = 'scroll-to-bottom-btn';
    scrollToBottomButton.innerHTML = '↓';
    scrollToBottomButton.title = 'Scroll to bottom';
    scrollToBottomButton.style.display = 'none';
    
    scrollToBottomButton.addEventListener('click', () => {
        const chatContainer = getChatContainer();
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    });
    
    document.body.appendChild(scrollToBottomButton);
}

// Check if scroll is needed
function checkScrollPosition() {
    const chatContainer = getChatContainer();
    if (!chatContainer || !scrollToBottomButton) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainer;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5; // 5px tolerance
    
    // Show/hide scroll to bottom button
    scrollToBottomButton.style.display = isAtBottom ? 'none' : 'block';
}

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
                // Only auto-scroll if we're already at the bottom
                const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 5;
                if (isAtBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            }
            break;
        case 'llmRequest':
            // Display LLM request details in an expandable panel
            handleAgentUpdate({
                type: 'llmRequest',
                payload: message.payload,
                duration: message.duration
            });
            break;
        case 'llmError':
            // Display detailed LLM error
            handleAgentUpdate({
                type: 'llmError',
                error: message.error,
                duration: message.duration,
                source: message.source
            });
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
        case 'clearChat':
            // Clear the chat container
            const chatContainerToClear = getChatContainer();
            if (chatContainerToClear) {
                chatContainerToClear.innerHTML = '';
            }
            // Reset processing state
            setProcessing(false, false);
            updateSendButtonState();
            break;
    }
});

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initApp();
        createScrollToBottomButton();
    });
} else {
    initApp();
    createScrollToBottomButton();
}

// Add scroll event listener to monitor scrolling
const chatContainer = getChatContainer();
if (chatContainer) {
    chatContainer.addEventListener('scroll', checkScrollPosition);
}