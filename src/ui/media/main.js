
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

// Handlers
function toggleSpeech() {
    if (!recognition) return;
    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function sendMessage() {
    const text = inputBox.value.trim();
    if (!text && contextFiles.length === 0) return;

    vscode.postMessage({
        type: 'sendMessage',
        text: text,
        context: contextFiles
    });

    inputBox.value = '';
    contextFiles = [];
    renderContext();
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
if (sendBtn) sendBtn.addEventListener('click', sendMessage);

if (inputBox) {
    inputBox.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
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
            chatContainer.scrollTop = chatContainer.scrollHeight;
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
