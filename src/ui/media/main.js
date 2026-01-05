// Main entry point that imports and initializes all modules

// Import all modules
import { vscode } from './vscode_api.js';
import { applyTheme, initThemeManager } from './theme_manager.js';
import { renderMessage, handleAgentUpdate, getFullDateTime, showFullDateTime } from './message_renderer.js';
import {
    initializeDOMElements,
    getChatContainer,
    contextFiles,
    handleSendClick,
    sendMessage,
    setProcessing,
    updateSendButtonState,
    renderContext,
    getInputBoxValue,
    setInputBoxValue
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
    
    // Initialize webview-ui-toolkit components
    initializeToolkitComponents();
    
    // Signal to extension that webview is ready to receive messages
    vscode.postMessage({ type: 'webviewReady' });
}

// Initialize webview-ui-toolkit components
function initializeToolkitComponents() {
    // Wait for the toolkit to be loaded
    const checkToolkit = setInterval(() => {
        if (window.vscode && window.vscode.Tabs) {
            clearInterval(checkToolkit);
            
        }
    }, 100);
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

// Scroll position tracking for tab switching
let chatScrollPositions = {};
let lastActiveTab = 'chat';

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

// Save scroll position when leaving chat tab
function saveChatScrollPosition() {
    const chatContainer = getChatContainer();
    if (chatContainer) {
        chatScrollPositions['chat'] = chatContainer.scrollTop;
    }
}

// Restore scroll position when returning to chat tab
function restoreChatScrollPosition() {
    const chatContainer = getChatContainer();
    if (!chatContainer) return;
    
    // Check if we have a saved scroll position
    const savedPosition = chatScrollPositions['chat'];
    
    if (savedPosition !== undefined && savedPosition > 0) {
        // Restore the saved position
        chatContainer.scrollTop = savedPosition;
    } else {
        // No saved position or first time - scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Auto-scroll to bottom when new messages arrive if we're near the bottom
function autoScrollIfAtBottom() {
    const chatContainer = getChatContainer();
    if (!chatContainer) return;
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainer;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 20; // 20px tolerance
    
    if (isNearBottom) {
        // Only auto-scroll if we're already near the bottom
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 50); // Small delay to allow DOM to update
    }
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

            // Scroll to bottom after restoring (use our improved logic)
            if (chatContainer && chatContainer.scrollHeight > 0) {
                // For history restore, always scroll to bottom initially
                // The user can then scroll up if they want to see older messages
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
            // Use our improved auto-scroll function
            autoScrollIfAtBottom();
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
        case 'marketplaceStats':
            updateMarketplaceStats(message.stats);
            break;
    }
});

// Setup timestamp toggle functionality
function setupTimestampToggle() {
    // Add event listener for timestamp clicks using event delegation
    const chatContainer = getChatContainer();
    if (chatContainer) {
        chatContainer.addEventListener('click', function(e) {
            // Check if the click was on a timestamp element
            if (e.target.classList.contains('message-timestamp')) {
                e.preventDefault();
                e.stopPropagation();
                
                // Toggle the global state
                showFullDateTime = !showFullDateTime;
                
                // Update all timestamps in the chat
                const allTimestamps = document.querySelectorAll('.message-timestamp');
                allTimestamps.forEach(timestampElement => {
                    const fullTimestamp = timestampElement.getAttribute('data-full-timestamp');
                    if (fullTimestamp) {
                        timestampElement.textContent = showFullDateTime
                            ? getFullDateTime(fullTimestamp)
                            : '⏰';
                    }
                });
            }
        });
    }
}

// Initialize the application when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        initApp();
        createScrollToBottomButton();
        setupTimestampToggle();
    });
} else {
    initApp();
    createScrollToBottomButton();
    setupTimestampToggle();
}

// Add scroll event listener to monitor scrolling
const chatContainer = getChatContainer();
if (chatContainer) {
    chatContainer.addEventListener('scroll', checkScrollPosition);
}

// Update marketplace stats display
function updateMarketplaceStats(stats) {
    const statsElement = document.getElementById('marketplace-stats');
    if (statsElement) {
        statsElement.innerHTML = `
            <div class="marketplace-stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Total Servers</div>
                    <div class="stat-value">${stats.totalServers}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Installed</div>
                    <div class="stat-value">${stats.installedServers}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Updates Available</div>
                    <div class="stat-value">${stats.availableUpdates}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Last Updated</div>
                    <div class="stat-value">${stats.lastUpdated}</div>
                </div>
            </div>
        `;
    }
}

// Export scroll management functions for use in other modules
export {
    saveChatScrollPosition,
    restoreChatScrollPosition,
    autoScrollIfAtBottom
};