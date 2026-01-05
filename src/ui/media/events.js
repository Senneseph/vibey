import { vscode } from './vscode_api.js';
import {
    handleSendClick,
    updateSendButtonState,
    getIsProcessing,
    getInputBox
} from './chat_manager.js';
import {
    saveChatScrollPosition,
    restoreChatScrollPosition,
    autoScrollIfAtBottom
} from './main.js';

// DOM elements - lazy loaded
let inputBox, sendBtn, attachBtn, settingsBtn, modelsBtn, contextArea;

// Scroll position tracking for tab switching
let lastActiveTab = 'chat';

function initializeEventElements() {
    inputBox = document.getElementById('InputBox');
    sendBtn = document.getElementById('send-btn');
    attachBtn = document.getElementById('attach-btn');
    settingsBtn = document.getElementById('settings-btn');
    modelsBtn = document.getElementById('models-btn');
    contextArea = document.getElementById('context-area');

    // Send button
    if (sendBtn) sendBtn.addEventListener('click', handleSendClick);

    // Input box - for vscode-text-area, we need to listen to the internal textarea
    if (inputBox) {
        // Find the internal textarea element
        const internalTextarea = inputBox.shadowRoot?.querySelector('textarea');
        
        if (internalTextarea) {
            internalTextarea.addEventListener('input', () => {
                // If user types, we leave "Resume" state and go to "Send" state
                updateSendButtonState();
            });

            internalTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    // Enter always attempts to send or resume
                    handleSendClick();
                }
            });
        }
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

    const testBtn = document.getElementById('test-btn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'runFeatureTests' });
        });
    }

}

// Tabs - using regular buttons with proper event handling
function setupTabs() {
    // Set up tab click event listeners
    const chatTab = document.getElementById('chat-tab');
    const tasksTab = document.getElementById('tasks-tab');
    
    if (chatTab && tasksTab) {
        chatTab.addEventListener('click', () => {
            if (lastActiveTab !== 'chat') {
                // Save scroll position before switching away from current tab
                if (lastActiveTab === 'tasks') {
                    // Could add tasks scroll position saving here if needed
                }
                
                // Switch to chat tab
                chatTab.classList.add('active');
                tasksTab.classList.remove('active');
                chatTab.setAttribute('aria-selected', 'true');
                tasksTab.setAttribute('aria-selected', 'false');
                
                document.getElementById('chat-view').classList.add('active');
                document.getElementById('tasks-view').classList.remove('active');
                lastActiveTab = 'chat';
                
                // Restore scroll position when returning to chat tab
                setTimeout(restoreChatScrollPosition, 50);
            }
        });
        
        tasksTab.addEventListener('click', () => {
            if (lastActiveTab !== 'tasks') {
                // Save scroll position before switching away from chat tab
                if (lastActiveTab === 'chat') {
                    saveChatScrollPosition();
                }
                
                // Switch to tasks tab
                tasksTab.classList.add('active');
                chatTab.classList.remove('active');
                tasksTab.setAttribute('aria-selected', 'true');
                chatTab.setAttribute('aria-selected', 'false');
                
                document.getElementById('tasks-view').classList.add('active');
                document.getElementById('chat-view').classList.remove('active');
                lastActiveTab = 'tasks';
                
                // Fetch tasks data
                vscode.postMessage({ type: 'getTasks' });
            }
        });
    }
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