
const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');
const settingsBtn = document.getElementById('settings-btn');
const contextArea = document.getElementById('context-area');

// State
let contextFiles = [];

// Handlers
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

function appendMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;

    // Markdown-ish rendering (very basic)
    const formatted = content
        .replace(/\n/g, '<br>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    div.innerHTML = `<strong>${role.toUpperCase()}</strong><br>${formatted}`;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
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

// Events
sendBtn.addEventListener('click', sendMessage);

inputBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

attachBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectContext' });
});

settingsBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
});

// Incoming Messages
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'addMessage':
            appendMessage(message.role, message.content);
            break;
        case 'appendContext':
            // Add file to local state
            contextFiles.push(message.file); // { name, path, type }
            renderContext();
            break;
    }
});
