
const vscode = acquireVsCodeApi();
const chatContainer = document.getElementById('chat-container');
const inputBox = document.getElementById('InputBox');
const sendBtn = document.getElementById('send-btn');
const attachBtn = document.getElementById('attach-btn');

const settingsBtn = document.getElementById('settings-btn');
const micBtn = document.getElementById('mic-btn'); // New
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
    micBtn.style.display = 'none'; // Hide if not supported
    console.log("Web Speech API not supported.");
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

micBtn.addEventListener('click', toggleSpeech);

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
