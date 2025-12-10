import { vscode } from './vscode_api.js';
import { getChatContainer } from './chat_manager.js';

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
        getChatContainer().appendChild(div);
        return;
    }

    // Create message wrapper with timestamp and user identification
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${role}`;
    
    const messageMeta = document.createElement('div');
    messageMeta.className = 'message-meta';
    messageMeta.innerHTML = `\n        <span class="message-user">${role === 'user' ? 'You' : 'Vibey'}</span>\n        <span class="message-timestamp">${timestamp || getTimestamp()}</span>\n    `;
    
    const messageContent = document.createElement('div');
    messageContent.className = `message ${role}`;

    // Assistant messages might be JSON with thoughts/tools
    if (role === 'assistant') {
        // Try to parse as JSON - handle both \n and \r\n line endings
        let parsed = null;
        try {
            let jsonContent = null;

            // Try fenced code block first (handles Windows \r\n)
            const fencedMatch = content.match(/`\`\`\`json[\r\n]+([\s\S]*?)[\r\n]+\`\`\`/);
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
                    toolDiv.innerHTML = `\n                        <div class="tool-header">\n                            <span class="tool-icon">🛠️</span>\n                            <span class="tool-name">${call.name}</span>\n                            <span class="tool-summary">${formatToolParams(call.name, call.parameters)}</span>\n                        </div>\n                        <details class="tool-details">\n                            <summary>Details</summary>\n                            <pre>${JSON.stringify(call.parameters, null, 2)}</pre>\n                        </details>\n                    `;
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
        if (!content.includes('<pre>')) {
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

        div.innerHTML = `\n            <div class="tool-header">\n                <span class="tool-icon">⏳</span>\n                <span class="tool-name">${update.tool}</span>\n                <span class="tool-summary">${formatToolParams(update.tool, update.parameters)}</span>\n            </div>\n            <details class="tool-details">\n                <summary>Parameters</summary>\n                <pre>${JSON.stringify(update.parameters, null, 2)}</pre>\n            </details>\n        `;
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
        } else {
            // Fallback if we missed the start event
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'message system-update';
            fallbackDiv.innerHTML = `<em>${update.success ? '✅' : '❌'} Finished tool: ${update.tool}</em>`;
            if (update.result) {
                const resultText = typeof update.result === 'object' ? JSON.stringify(update.result, null, 2) : update.result;
                fallbackDiv.innerHTML += `<details><summary>Result</summary><pre>${resultText}</pre></details>`;
            }
            getChatContainer().appendChild(fallbackDiv);
        }
        getChatContainer().scrollTop = getChatContainer().scrollHeight;
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
        case 'contextAdded':
            // Display context information
            const fileList = update.files.map(f => `<li><code>${f.name}</code> (${f.path})</li>`).join('');
            div.innerHTML = `<details><summary>📁 Context Added (~${update.tokenEstimate} tokens)</summary><ul>${fileList}</ul><small>${update.characterCount} characters</small></details>`;
            break;
        case 'tokens':
            // Display token usage information
            div.innerHTML = `<strong>📊 Token Usage:</strong> ${update.sent} sent, ${update.received} received`;
            break;
        case 'llmRequest':
            // Display LLM request details with message preview
            const payload = update.payload || {};
            const msgCount = payload.messages?.length || payload.messageCount || 0;
            const payloadSize = JSON.stringify(payload.messages || []).length;
            const estTokens = update.estimatedTokens || Math.ceil(payloadSize / 4);
            
            // Create message preview
            let messagePreview = '';
            if (payload.messages && Array.isArray(payload.messages)) {
                const lastMsg = payload.messages[payload.messages.length - 1];
                if (lastMsg) {
                    const content = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);
                    const preview = content.length > 300 ? content.substring(0, 300) + '...' : content;
                    messagePreview = `<br><strong>Last message preview:</strong><br><div style="background: #f5f5f5; padding: 8px; margin: 5px 0; border-left: 3px solid #0066cc; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto;">${preview.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
                }
            }
            
            const statusText = update.duration > 0 ? `✅ Completed in ${update.duration}ms` : `⏳ Sending...`;
            div.innerHTML = `<details><summary>🔌 LLM Request ${statusText} (${estTokens} tokens)</summary>
                <div style="font-size: 0.9em; font-family: monospace;">
                    <strong>Model:</strong> ${payload.model || 'unknown'}<br>
                    <strong>Messages in history:</strong> ${msgCount}<br>
                    <strong>Payload size:</strong> ${payloadSize} bytes<br>
                    <strong>Estimated tokens:</strong> ~${estTokens}<br>
                    <strong>Duration:</strong> ${update.duration}ms${messagePreview}<br>
                    <em style="color: #666; font-size: 0.85em;">Detailed request logged to Extension Host output (View → Output → Vibey)</em>
                </div>
            </details>`;
            break;
        case 'llmError':
            // Display detailed LLM error with source
            div.innerHTML = `<details open><summary>❌ LLM Error (${update.duration}ms)</summary>
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
            break;
    }
    getChatContainer().appendChild(div);
    getChatContainer().scrollTop = getChatContainer().scrollHeight;
}

// Export for use in other modules
export { renderMessage, handleAgentUpdate, formatToolParams };