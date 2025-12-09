
const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');

const settingsBtn = document.getElementById('settings-btn');
const micBtn = document.getElementById('mic-btn');
const contextArea = document.getElementById('context-area');

// Detect and apply theme
function applyTheme() {
    // Get current theme from VS Code
    const theme = vscode.getState()?.theme || 'dark';
    
    // Remove existing theme classes
    document.body.classList.remove('theme-dark', 'theme-light');
    
    // Apply appropriate theme
    if (theme === 'light') {
        document.body.classList.add('theme-light');
    } else {
        document.body.classList.add('theme-dark');
    }
}

// Initialize theme on load
applyTheme();

// Listen for theme changes
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'themeChanged':
            // Update theme state
            const theme = message.theme || 'dark';
            vscode.setState({ theme });
            applyTheme();
            break;
    }
});

// State
let contextFiles = [];
let recognition;
let isListening = false;
let isProcessing = false;
let isResumable = false;
let taskFilters = { status: 'all', sort: 'date-desc' };
let allTasks = [];

// Mic button opens a separate WebviewPanel with proper mic permissions
if (micBtn) {
    micBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Request the extension to open the MicPanel
        vscode.postMessage({ type: 'voiceInput' });
    });
}

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

// Open voice input panel (keyboard shortcut)
function openVoiceInput() {
    vscode.postMessage({ type: 'voiceInput' });
}


let lastMessageText = '';
let lastContextFiles = [];

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

function renderTasks(tasks) {
    const list = document.getElementById('task-list');
    if (!list) return;
    list.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        list.innerHTML = '<div class="empty-state">No active tasks. Ask Vibey to start a task!</div>';
        return;
    }

    tasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'task-item';

        let stepsHtml = '';
        if (task.steps && task.steps.length > 0) {
            stepsHtml = '<ul class="step-list">' +
                task.steps.map(s => `<li>[${s.status === 'completed' ? 'x' : ' '}] ${s.description}</li>`).join('') +
                '</ul>';
        }

        item.innerHTML = `
            <div class="task-header">
                <span class="task-title">${task.title}</span>
                <span class="task-status status-${task.status}">${task.status}</span>
            </div>
            <div class="task-steps">${stepsHtml}</div>
        `;
        list.appendChild(item);
    });
}


// Helper to format tool parameters nicely
function formatToolParams(name, params) {
    if (!params) return '';

    // Custom formatting for common tools
    if (name === 'read_file' || name === 'write_file' || name === 'apply_patch') {
        let text = `File: <span class="path">${params.path || params.target_file}</span>`;
        if (params.start_line) text += ` lines ${params.start_line}-${params.end_line || 'end'}`;
        return text;
    }
    if (name === 'run_command' || name === 'terminal_run') {
        return `Command: <code>${params.command}</code>`;
    }

    // Default
    return JSON.stringify(params);
}

// Helper function to render a single message
// Utility: Get current timestamp in readable format
function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function renderMessage(role, content, timestamp = null) {
    // If it's a tool output (raw JSON result)
    if (role === 'tool') {
        // We try to append this to the previous tool block if it exists
        // But since we are rendering linearly, we might just render a "Result" block
        // OR better: we don't render 'tool' messages directly as separate bubbles if we can avoid it.
        // However, looking at history, we have separate messages.
        // Strategy: Render it as a "Tool Result" block.
        const div = document.createElement('div');
        div.className = `message tool-result`;
        let resultPretty = content;
        try {
            const parsed = JSON.parse(content);
            resultPretty = JSON.stringify(parsed, null, 2);
        } catch (e) { }

        div.innerHTML = `<details><summary>Tool Output</summary><pre>${resultPretty}</pre></details>`;
        chatContainer.appendChild(div);
        return;
    }

    // Create message wrapper with timestamp and user identification
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${role}`;
    
    const messageMeta = document.createElement('div');
    messageMeta.className = 'message-meta';
    messageMeta.innerHTML = `
        <span class="message-user">${role === 'user' ? 'You' : 'Vibey'}</span>
        <span class="message-timestamp">${timestamp || getTimestamp()}</span>
    `;
    
    const messageContent = document.createElement('div');
    messageContent.className = `message ${role}`;

    // Assistant messages might be JSON with thoughts/tools
    if (role === 'assistant') {
        // Try to parse as JSON - handle both \n and \r\n line endings
        let parsed = null;
        try {
            let jsonContent = null;

            // Try fenced code block first (handles Windows \r\n)
            const fencedMatch = content.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
            if (fencedMatch) {
                jsonContent = fencedMatch[1].trim();
                // Sometimes LLMs duplicate the "json" word inside the block
                if (jsonContent.startsWith('json')) {
                    jsonContent = jsonContent.slice(4).trim();
                }
            } else {
                // Fallback: look for JSON object starting with thought or tool_calls
                const jsonMatch = content.match(/(\{\s*"(?:thought|tool_calls)"[\s\S]*?\})\s*$/);
                if (jsonMatch) {
                    jsonContent = jsonMatch[1];
                }
            }

            if (jsonContent) {
                parsed = JSON.parse(jsonContent);
            }
        } catch (e) { }

        if (parsed) {
            // Render Thought
            if (parsed.thought) {
                const thoughtDiv = document.createElement('div');
                thoughtDiv.className = 'message system-update';
                thoughtDiv.innerHTML = `<details open><summary>Thinking Plan</summary><pre>${parsed.thought}</pre></details>`;
                messageContent.appendChild(thoughtDiv);
            }

            // Render Tool Calls
            if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                parsed.tool_calls.forEach(call => {
                    const toolDiv = document.createElement('div');
                    toolDiv.className = 'message tool-call';
                    toolDiv.innerHTML = `
                        <div class="tool-header">
                            <span class="tool-icon">🛠️</span>
                            <span class="tool-name">${call.name}</span>
                            <span class="tool-summary">${formatToolParams(call.name, call.parameters)}</span>
                        </div>
                        <details class="tool-details">
                            <summary>Details</summary>
                            <pre>${JSON.stringify(call.parameters, null, 2)}</pre>
                        </details>
                    `;
                    messageContent.appendChild(toolDiv);
                });
            }

            // Append message meta and content, then to chat
            messageWrapper.appendChild(messageMeta);
            messageWrapper.appendChild(messageContent);
            chatContainer.appendChild(messageWrapper);

            // If it was just JSON, we are done. 
            return;
        }
    }

    // Default Text Rendering
    messageContent.innerHTML = content;

    // Basic thinking block support (legacy)
    if (content.includes('<thought>')) {
        messageContent.innerHTML = content.replace(/<thought>([\s\S]*?)<\/thought>/g,
            '<details open class="thought-block"><summary>Thinking...</summary><pre>$1</pre></details>');
    } else {
        // Formatting for code blocks
        if (!content.includes('<pre>')) {
            messageContent.innerHTML = content
                .replace(/\n/g, '<br>')
                .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        }
    }

    messageWrapper.appendChild(messageMeta);
    messageWrapper.appendChild(messageContent);
    chatContainer.appendChild(messageWrapper);
}

function handleAgentUpdate(update) {
    if (update.type === 'tool_start') {
        const div = document.createElement('div');
        div.className = 'message tool-call running';
        div.id = `tool-${update.id}`; // Use ID for updates

        div.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">⏳</span>
                <span class="tool-name">${update.tool}</span>
                <span class="tool-summary">${formatToolParams(update.tool, update.parameters)}</span>
            </div>
            <details class="tool-details">
                <summary>Parameters</summary>
                <pre>${JSON.stringify(update.parameters, null, 2)}</pre>
            </details>
        `;
        chatContainer.appendChild(div);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return;
    }

    if (update.type === 'tool_end') {
        const div = document.getElementById(`tool-${update.id}`);
        if (div) {
            div.classList.remove('running');
            div.classList.add(update.success ? 'success' : 'error');

            // Update header icon
            const icon = div.querySelector('.tool-icon');
            if (icon) icon.textContent = update.success ? '✅' : '❌';

            // Append result
            if (update.result || update.error) {
                const resultText = update.error
                    ? `Error: ${update.error}`
                    : (typeof update.result === 'object' ? JSON.stringify(update.result, null, 2) : update.result);

                const resultDetails = document.createElement('details');
                resultDetails.innerHTML = `<summary>Result</summary><pre>${resultText}</pre>`;
                div.appendChild(resultDetails);
            }
        } else {
            // Fallback if we missed the start event
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'message system-update';
            fallbackDiv.innerHTML = `<em>${update.success ? '✅' : '❌'} Finished tool: ${update.tool}</em>`;
            if (update.result) {
                const resultText = typeof update.result === 'object' ? JSON.stringify(update.result, null, 2) : update.result;
                fallbackDiv.innerHTML += `<details><summary>Result</summary><pre>${resultText}</pre></details>`;
            }
            chatContainer.appendChild(fallbackDiv);
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return;
    }

    const div = document.createElement('div');
    div.className = 'message system-update';

    switch (update.type) {
        case 'thinking':
            div.innerHTML = `<em>🤔 ${update.message}</em>`;
            break;
        case 'thought':
            div.innerHTML = `<details open><summary>Thinking Plan</summary><pre>${update.message}</pre></details>`;
            break;
        case 'tokens':
            // Display token usage information
            div.innerHTML = `<strong>📊 Token Usage:</strong> ${update.sent} sent, ${update.received} received`;
            break;
    }
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Global Error Handler
window.onerror = function (message, source, lineno, colno, error) {
    vscode.postMessage({
        type: 'error',
        message: `UI Error: ${message}`
    });
};


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

const modelsBtn = document.getElementById('models-btn');
if (modelsBtn) {
    modelsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectModel' });
    });
}

const settingsBtnElem = document.getElementById('settings-btn');
if (settingsBtnElem) {
    settingsBtnElem.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });
}

// Tabs
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
            // Update UI to show listening state
            micBtn.classList.add('listening');
            break;
        case 'voiceInputReceived':
            // Add the voice transcript to the input box
            if (message.text) {
                inputBox.value += (inputBox.value ? ' ' : '') + message.text;
                inputBox.focus();
                updateSendButtonState();
            }
            micBtn.classList.remove('listening');
            break;
        case 'voiceInputError':
            // Show error to user
            console.error('Voice input error:', message.message);
            micBtn.classList.remove('listening');
            if (message.message) {
                vscode.postMessage({
                    type: 'error',
                    message: `Voice input error: ${message.message}`
                });
            }
            break;
    }
});

// Task filtering and sorting
function filterAndRenderTasks() {
    let filtered = allTasks;
    
    if (taskFilters.status !== 'all') {
        filtered = filtered.filter(t => t.status === taskFilters.status);
    }
    
    if (taskFilters.sort === 'date-asc') {
        filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (taskFilters.sort === 'date-desc') {
        filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (taskFilters.sort === 'priority') {
        const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        filtered.sort((a, b) => (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99));
    }
    
    renderTasks(filtered);
}

function updateTaskFilter(status, sort) {
    if (status !== undefined) taskFilters.status = status;
    if (sort !== undefined) taskFilters.sort = sort;
    filterAndRenderTasks();
}

// Keyboard shortcuts
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

// Signal to extension that webview is ready to receive messages
vscode.postMessage({ type: 'webviewReady' });
