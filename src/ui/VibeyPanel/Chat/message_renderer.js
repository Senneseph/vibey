// import { vscode } from '../../vscode_api.js';
import { getChatContainer } from './chat_manager.js';
import { marked } from 'https://esm.sh/marked@12.0.0';

// Export functions and variables for use in other modules
export { getFullDateTime, toggleTimestampDisplay, getTimestampDisplayMode };

// Debug message buffer for bundling consecutive DEBUG messages
let debugMessageBuffer = [];
let debugMessageTimeout = null;

// Function to flush debug message buffer and create bundled display
function flushDebugMessages() {
    if (debugMessageBuffer.length === 0) return;

    const div = document.createElement('div');
    div.className = 'message system-update debug';
    
    // Create bundled debug message display
    const debugContent = debugMessageBuffer.map(msg => msg).join('\n\n');
    div.innerHTML = `
        <div class="debug-message-container">
            <details>
                <summary>ℹ️ (${debugMessageBuffer.length})</summary>
                <div class="debug-content">
                    <pre style="worwrap: break-word">${debugContent}</pre>
                </div>
            </details>
        </div>
    `;
    
    getChatContainer().appendChild(div);
    getChatContainer().scrollTop = getChatContainer().scrollHeight;
    
    // Clear buffer
    debugMessageBuffer = [];
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

// Utility: Get current timestamp in readable format
function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

// Utility: Get full date and time format
function getFullDateTime(timestamp = null) {
    let dateObj;
    if (timestamp) {
        // Parse existing timestamp (HH:MM:SS format)
        const [hours, minutes, seconds] = timestamp.split(':');
        dateObj = new Date();
        dateObj.setHours(parseInt(hours), parseInt(minutes), parseInt(seconds));
    } else {
        dateObj = new Date();
    }
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Global state to track timestamp display mode
const timestampState = {
    showFullDateTime: false
};

// Function to toggle timestamp display mode
function toggleTimestampDisplay() {
    timestampState.showFullDateTime = !timestampState.showFullDateTime;
    return timestampState.showFullDateTime;
}

// Function to get current timestamp display mode
function getTimestampDisplayMode() {
    return timestampState.showFullDateTime;
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
        } catch (e) {}

        div.innerHTML = `<details><summary>Tool Output</summary><pre>${resultPretty}</pre></details>`;
        getChatContainer().appendChild(div);
        return;
    }

    // Create message wrapper with timestamp and user identification
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${role}`;
    
    const messageMeta = document.createElement('div');
    messageMeta.className = 'message-meta';
    
    const timestampValue = timestamp || getTimestamp();
    const displayTimestamp = timestampState.showFullDateTime ? getFullDateTime(timestampValue) : '⏰';
    
    messageMeta.innerHTML = `
        <span class="message-user">${role === 'user' ? 'You' : 'Vibey'}</span>
        <span class="message-timestamp" data-full-timestamp="${timestampValue}">${displayTimestamp}</span>
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
                const jsonMatch = content.match(/(\{\s*\"(?:thought|tool_calls)\"[\s\S]*?\})\s*$/);
                if (jsonMatch) {
                    jsonContent = jsonMatch[1];
                }
            }

            if (jsonContent) {
                parsed = JSON.parse(jsonContent);
            }
        } catch (e) {}

        if (parsed) {
            // Render Thought
            if (parsed.thought) {
                const thoughtDiv = document.createElement('div');
                thoughtDiv.className = 'message system-update';
                thoughtDiv.innerHTML = `<details open><summary>Thinking Plan</summary>${parsed.thought}</details>`;
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
                            ${JSON.stringify(call.parameters, null, 2)}
                        </details>
                    `;
                    messageContent.appendChild(toolDiv);
                });
            }

            // Append message meta and content, then to chat
            messageWrapper.appendChild(messageMeta);
            messageWrapper.appendChild(messageContent);
            getChatContainer().appendChild(messageWrapper);

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
        if (!content.includes('<pre')) {
            messageContent.innerHTML = content
                .replace(/\n/g, '<br>')
                .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        }
    }

    messageWrapper.appendChild(messageMeta);
    messageWrapper.appendChild(messageContent);
    getChatContainer().appendChild(messageWrapper);
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
        getChatContainer().appendChild(div);
        getChatContainer().scrollTop = getChatContainer().scrollHeight;
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
        }
        return;
    }

    const div = document.createElement('div');
    div.className = 'message system-update';

    switch (update.type) {
        case 'thinking':
            div.innerHTML = `<em>🤔 ${update.message}</em>`;
            break;
        case 'thought':
            div.innerHTML = `<details open><summary>Thinking Plan</summary>${update.message}</details>`;
            break;
        case 'contextAdded':
            // Display context information
            const fileList = update.files.map(f => `<li><code>${f.name}</code> (${f.path})</li>`).join('');
            div.innerHTML = `<details><summary>📁 Context Added (~${update.tokenEstimate} tokens)</summary><ul>${fileList}</ul><small>${update.characterCount} characters</small></details>`;
            break;
        case 'tokens':
            // Display token usage information
            div.innerHTML = `<strong>📊 Token Usage:</strong> ${update.sent} sent, ${update.received} received`;
            break;
        case 'perMessageTokens':
            // Display per-message token usage with meter
            div.className = 'message system-update per-message-tokens';
            div.innerHTML = `
                <div style="margin-top: 0px; font-size: 0.9em;">
                    <strong>📊 Per-Message Token Usage:</strong>
                    This message: ${update.messageTokens} tokens, Current total: ${update.currentTotal} tokens (${update.percentage}%), Remaining: ${update.remaining} tokens
                </div>
                <!-- <div class="token-meter">
                     ${update.meter}
                </div>-->
            `;
            break;
        case 'contextCondensed':
            // Display context condensation information
            div.className = 'message system-update context-condensed';
            div.innerHTML = `
                <strong>🔄 Context Condensed:</strong>
                <div style="margin-top: 5px; font-size: 0.9em;">
                    ${update.message}<br>
                    Original: ${update.originalSize} characters<br>
                    Condensed: ${update.condensedSize} characters
                </div>
            `;
            break;
        case 'llmRequest':
            // Display LLM request details with message preview in LLM Stream tab
            const payload = update.payload || {};
            const msgCount = payload.messages?.length || payload.messageCount || 0;
            const payloadSize = JSON.stringify(payload.messages || []).length;
            const estTokens = update.estimatedTokens || Math.ceil(payloadSize / 4);
            
            // Render to LLM Stream container instead of chat
            const streamContainer = document.getElementById('llm-stream-container');
            if (streamContainer) {
                const div = document.createElement('div');
                div.className = 'message system-update';
                
                // Check if there's an existing llmRequest panel to update
                let messagePreviews = '';
                const existingRequest = streamContainer.querySelector('[data-message-type="llmRequest"]');
                
                // Implement log rotation - keep only last 50 updates
                const updates = streamContainer.querySelectorAll('.message.system-update');
                if (updates.length >= 50) {
                    // Remove oldest updates
                    for (let i = 0; i < updates.length - 49; i++) {
                        streamContainer.removeChild(updates[i]);
                    }
                }
                
                if (payload.messages) {
                    const systemMsg = payload.messages.find(m => m.role === 'system');
                    const otherMsgs = payload.messages.filter(m => m.role !== 'system');
                    
                    if (systemMsg) {
                        const content = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
                        const preview = content.length > 150 ? content.substring(0, 150) + '. .' : content;
                        messagePreviews += `<div style="margin-bottom: 10px;"><strong>📋 System Prompt:</strong><br><div style="background: #f0f0f0; padding: 6px; margin-top: 4px; border-left: 3px solid #ff9800; white-space: pre-wrap; word-break: break-word; font-size: 0.85em; max-height: 120px; overflow-y: auto;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`;
                    }
                    
                    otherMsgs.forEach((msg, idx) => {
                        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                        const preview = content.length > 200 ? content.substring(0, 200) + '. .' : content;
                        const bgColor = msg.role === 'user' ? '#e3f2fd' : msg.role === 'assistant' ? '#f3e5f5' : '#fff3e0';
                        const borderColor = msg.role === 'user' ? '#2196f3' : msg.role === 'assistant' ? '#9c27b0' : '#ff9800';
                        const emoji = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '🔧';
                        messagePreviews += `<div style="margin-bottom: 8px;"><strong>${emoji} ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}:</strong><br><div style="background: ${bgColor}; padding: 6px; margin-top: 4px; border-left: 3px solid ${borderColor}; white-space: pre-wrap; word-break: break-word; font-size: 0.85em; max-height: 100px; overflow-y: auto;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`;
                    });
                }
                
                const statusText = update.duration > 0 ? `✅ Completed in ${update.duration}ms` : `⏳ Sending...`;
                const content = `<details ${update.duration > 0 ? '' : 'open'}><summary>🔌 LLM Request ${statusText} (${estTokens} tokens)</summary>
                    <div style="font-size: 0.9em; font-family: monospace;">
                        <strong>Model:</strong> ${payload.model || 'unknown'}<br>
                        <strong>Messages in history:</strong> ${msgCount}<br>
                        <strong>Payload size:</strong> ${payloadSize} bytes<br>
                        <strong>Estimated tokens:</strong> ~${estTokens}<br>
                        <strong>Duration:</strong> ${update.duration}ms${messagePreviews ? '<br><br><strong>Message Details:</strong>' : ''}<div style="margin-top: 10px;">${messagePreviews}</div>
                        <em style="color: #666; font-size: 0.85em; margin-top: 10px; display: block;">Detailed request logged to Extension Host output (View → Output → Vibey)</em>
                    </div>
                </details>`;
                
                if (existingRequest && update.duration > 0) {
                    // Update existing request panel with actual duration
                    existingRequest.innerHTML = content;
                } else {
                    // Create new request panel
                    div.innerHTML = content;
                    div.setAttribute('data-message-type', 'llmRequest');
                    streamContainer.appendChild(div);
                    streamContainer.scrollTop = streamContainer.scrollHeight;
                }
            }
            return;
        case 'llmError':
            // Display detailed LLM error in LLM Stream tab
            const errorDiv = document.createElement('div');
            errorDiv.className = 'message system-update';
            errorDiv.innerHTML = `<details open><summary>❌ LLM Error (${update.duration}ms)</summary>
                <div style="font-size: 0.9em; font-family: monospace; color: #d32f2f;">
                    <strong>Error:</strong> ${update.error || 'Unknown error'}<br>
                    <strong>Source:</strong> ${update.source || 'Unknown'}<br>
                    <strong>Duration:</strong> ${update.duration}ms<br>
                    <p><strong>Troubleshooting:</strong></p>
                    <ul>
                        <li>Check Ollama is running: <code>ollama serve</code></li>
                        <li>Verify connection URL in Vibey settings</li>
                        <li>Check browser console for network errors</li>
                        <li>Look at Extension Host output for details</li>
                    </ul>
                </div>
            </details>`;
            const llmStreamContainer = document.getElementById('llm-stream-container');
            if (llmStreamContainer) {
                llmStreamContainer.appendChild(errorDiv);
                
                // Implement log rotation for errors too
                const updates = llmStreamContainer.querySelectorAll('.message.system-update');
                if (updates.length > 50) {
                    // Remove oldest updates
                    for (let i = 0; i < updates.length - 50; i++) {
                        llmStreamContainer.removeChild(updates[i]);
                    }
                }
                
                llmStreamContainer.scrollTop = llmStreamContainer.scrollHeight;
            }
            return;
        case 'info':
            // Check if this is a DEBUG message
            if (update.message && update.message.includes('[DEBUG]')) {
                // Add to debug message buffer
                debugMessageBuffer.push(update.message);
                
                // Clear any existing timeout
                if (debugMessageTimeout) {
                    clearTimeout(debugMessageTimeout);
                }
                
                // Set timeout to flush messages after a short delay (500ms)
                debugMessageTimeout = setTimeout(flushDebugMessages, 500);
                
                // Don't display individual debug messages, they'll be bundled
                return;
            }
            
            // Regular info messages (non-DEBUG)
            div.className = 'message system-update info';
            div.innerHTML = `<div class="info-text">${marked.parse(update.message || '')}</div>`;
            break;
        case 'error':
            // Display error messages as expandable emoji section
            div.className = 'message system-update error';
            div.innerHTML = `
                <div class="error-message">
                    <details>
                        <summary>❌ Error</summary>
                        <div class="error-text">
                            ${marked.parse(update.message || '')}
                        </div>
                    </details>
                </div>
            `;
            break;
        case 'warning':
            // Display warning messages
            div.className = 'message system-update warning';
            div.innerHTML = `<div>${marked.parse(update.message || '')}</div>`;
            break;
    }
    
    // Only append div if it was created (not for debug messages that get bundled)
    if (div) {
        // Flush any pending debug messages BEFORE appending the current message
        // This ensures debug messages appear in the correct chronological order
        if (debugMessageBuffer.length > 0) {
            flushDebugMessages();
        }
        
        getChatContainer().appendChild(div);
        getChatContainer().scrollTop = getChatContainer().scrollHeight;
    }
}

// Export for use in other modules
export { renderMessage, handleAgentUpdate, formatToolParams };