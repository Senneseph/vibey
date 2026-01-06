/**
 * MCP Marketplace UI JavaScript
 */

// VSCode API
const vscode = acquireVsCodeApi();

// DOM elements
const serverListElement = document.getElementById('server-list');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');

// State
let currentServers = [];
let installedServerIds = [];

// Event listeners
refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('loading');
    vscode.postMessage({ type: 'refresh' });
});

searchInput.addEventListener('input', (e) => {
    const query = e.target.value;
    if (query.length > 2 || query.length === 0) {
        vscode.postMessage({ type: 'search', query });
    }
});

// Handle messages from extension
window.addEventListener('message', (event) => {
    const message = event.data;
     
    switch (message.type) {
        case 'loading-start':
            // Show loading state
            const loadingElement = document.createElement('div');
            loadingElement.className = 'loading-overlay';
            loadingElement.innerHTML = '<div class="loading-spinner"></div><p>Loading marketplace...</p>';
            document.body.appendChild(loadingElement);
            break;
            
        case 'loading-complete':
            // Remove loading state
            const loadingOverlay = document.querySelector('.loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
            
            // Remove loading class from refresh button
            refreshBtn.classList.remove('loading');
            break;
            
        case 'marketplace-update':
        case 'search-results':
            currentServers = message.servers;
            installedServerIds = message.installedServerIds;
            renderServerList();
            break;
             
        case 'install-success':
            installedServerIds.push(message.serverId);
            renderServerList();
            showNotification(`Successfully installed ${message.serverId}`, 'success');
            break;
             
        case 'install-error':
            showNotification(`Failed to install ${message.serverId}: ${message.message}`, 'error');
            break;
             
        case 'uninstall-success':
            installedServerIds = installedServerIds.filter(id => id !== message.serverId);
            renderServerList();
            showNotification(`Successfully uninstalled ${message.serverId}`, 'success');
            break;
             
        case 'uninstall-error':
            showNotification(`Failed to uninstall ${message.serverId}: ${message.message}`, 'error');
            break;
             
        case 'error':
            showNotification(`Error: ${message.message}`, 'error');
            
            // Remove loading state on error
            const errorLoadingOverlay = document.querySelector('.loading-overlay');
            if (errorLoadingOverlay) {
                errorLoadingOverlay.remove();
            }
            refreshBtn.classList.remove('loading');
            break;
    }
});

// Render server list
function renderServerList() {
    if (!serverListElement) return;
     
    if (currentServers.length === 0) {
        serverListElement.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🛒</div>
                <h3>No MCP Servers Available</h3>
                <p>Try refreshing or check your marketplace configuration</p>
            </div>
        `;
        return;
    }
     
    serverListElement.innerHTML = currentServers.map(server => `
        <div class="server-card">
            <div class="server-header">
                <div class="server-name">
                    ${server.name}
                    ${installedServerIds.includes(server.id) ? '<span class="installed-badge">Installed</span>' : ''}
                </div>
                <div class="server-version">v${server.version}</div>
            </div>
            <div class="server-description">${server.description}</div>
            <div class="server-author">By ${server.author}</div>
            <div class="server-tags">
                ${server.tags.map(tag => `<span class="server-tag">${tag}</span>`).join('')}
            </div>
            <div class="server-actions">
                ${installedServerIds.includes(server.id) ?
                    `<button class="uninstall-btn" data-server-id="${server.id}">Uninstall</button>` :
                    `<button class="install-btn" data-server-id="${server.id}">Install</button>`}
            </div>
        </div>
    `).join('');
     
    // Add event listeners to buttons
    document.querySelectorAll('.install-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serverId = btn.getAttribute('data-server-id');
            vscode.postMessage({ type: 'install', serverId });
        });
    });
     
    document.querySelectorAll('.uninstall-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serverId = btn.getAttribute('data-server-id');
            vscode.postMessage({ type: 'uninstall', serverId });
        });
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.padding = '12px 24px';
    notification.style.borderRadius = '4px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
    
    if (type === 'success') {
        notification.style.backgroundColor = 'var(--vscode-inputValidation-infoBackground)';
        notification.style.color = 'var(--vscode-inputValidation-infoForeground)';
    } else if (type === 'error') {
        notification.style.backgroundColor = 'var(--vscode-inputValidation-errorBackground)';
        notification.style.color = 'var(--vscode-inputValidation-errorForeground)';
    } else {
        notification.style.backgroundColor = 'var(--vscode-editorInfo-foreground)';
        notification.style.color = 'var(--vscode-editor-background)';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initial load
vscode.postMessage({ type: 'refresh' });