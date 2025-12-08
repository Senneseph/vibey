
const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');

const settingsBtn = document.getElementById('settings-btn');
const micBtn = document.getElementById('mic-btn');
const contextArea = document.getElementById('context-area');


// State
let contextFiles = [];
let recognition;
let isListening = false;
let isProcessing = false;
let isResumable = false;

// Initialize Speech Recognition
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add('listening');
    };

    recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove('listening');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputBox.value += (inputBox.value ? ' ' : '') + transcript;
        inputBox.focus();
        updateSendButtonState();
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        isListening = false;
        micBtn.classList.remove('listening');
    };
} else {
    // micBtn might be hidden in CSS if not supported, or we can hide it here
    if (micBtn) micBtn.style.display = 'none';
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

// Handlers
function toggleSpeech() {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
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

function handleAgentUpdate(update) {
    const div = document.createElement('div');
    div.className = 'message system-update';

    switch (update.type) {
        case 'thinking':
            div.innerHTML = `<em>🤔 ${update.message}</em>`;
            break;
        case 'thought':
            div.innerHTML = `<details open><summary>Thinking Plan</summary><pre>${update.message}</pre></details>`;
            break;
        case 'tool_start':
            div.innerHTML = `<em>🛠️ Running tool: ${update.tool}...</em>`;
            break;
        case 'tool_end':
            div.innerHTML = `<em>${update.success ? '✅' : '❌'} Finished tool: ${update.tool}</em>`;
            if (update.error) {
                div.innerHTML += `<br><span class="error">Error: ${update.error}</span>`;
            }
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

if (micBtn) micBtn.addEventListener('click', toggleSpeech);

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
        case 'addMessage':
            const div = document.createElement('div');
            div.className = `message ${message.role}`;
            div.innerHTML = message.content;

            // Basic thinking block support
            if (message.content.includes('<thought>')) {
                div.innerHTML = message.content.replace(/<thought>([\s\S]*?)<\/thought>/g,
                    '<details open class="thought-block"><summary>Thinking...</summary><pre>$1</pre></details>');
            } else {
                // Formatting for code blocks if not already formatted (basic check)
                if (!message.content.includes('<pre>')) {
                    div.innerHTML = message.content
                        .replace(/\n/g, '<br>')
                        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
                }
            }

            chatContainer.appendChild(div);
            // Auto-scroll
            chatContainer.scrollTop = chatContainer.scrollHeight;

            // Check if this was an assistant message to stop processing state
            if (message.role === 'assistant' || message.role === 'error') {
                // Heuristic: If we get an assistant response, we are likely done or waiting for next turn.
                // But orchestrator sends multiple messages (thoughts, tools). 
                // We need a specific "processingComplete" or similar, OR we assume assistant text (not tool) ends it?
                // Actually, `AgentOrchestrator` sends final text response last.
                // However, tools send intermediate messages.
                // Let's assume we stay in processing until we get a purely text response that isn't a tool call?
                // Getting specific "requestComplete" message would be better.
                // For now, let's keep it simple: We rely on 'requestStopped' or 'requestComplete' (which we need to add to backend)
            }
            break;
        case 'requestStopped':
            isProcessing = false;
            isResumable = true;
            updateSendButtonState();
            break;
        case 'requestComplete':
            isProcessing = false;
            isResumable = false; // Normal completion doesn't trigger resume state, or does it? User said "Only if we type a new message OR the initial request completes should it turn back into blue". 
            // "If we do have to cancel a request... option... to have gray resume icon."
            // So normal completion -> Send button (Blue). Cancelled -> Resume button (Gray).
            isResumable = false;
            updateSendButtonState();
            break;
        case 'appendContext':
            contextFiles.push(message.file);
            renderContext();
            break;
        case 'updateTasks':
            renderTasks(message.tasks);
            break;
        case 'agentUpdate':
            handleAgentUpdate(message.update);
            break;
    }
});
