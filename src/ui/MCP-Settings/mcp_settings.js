/**
 * MCP Settings Panel JavaScript
 */

// VSCode API
const vscode = acquireVsCodeApi();

// DOM elements
const settingsContainer = document.querySelector('.mcp-settings-container');
const configuredTab = document.getElementById('configured-tab');
const marketplaceTab = document.getElementById('marketplace-tab');
const configuredContent = document.getElementById('configured-content');
const marketplaceContent = document.getElementById('marketplace-content');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');

// State
let currentServers = {
    configured: [],
    marketplace: [],
    all: []
};
let currentSearchQuery = '';

// Tab switching
configuredTab.addEventListener('click', () => {
    configuredTab.classList.add('active');
    marketplaceTab.classList.remove('active');
    configuredContent.classList.add('active');
    marketplaceContent.classList.remove('active');
    renderCurrentView();
});

marketplaceTab.addEventListener('click', () => {
    marketplaceTab.classList.add('active');
    configuredTab.classList.remove('active');
    marketplaceContent.classList.add('active');
    configuredContent.classList.remove('active');
    renderCurrentView();
});

// Event listeners
refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('loading');
    vscode.postMessage({ type: 'refresh' });
});

searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderCurrentView();
});

// Handle messages from extension
window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
        case 'loading-start':
            showLoadingState();
            break;

        case 'loading-complete':
            hideLoadingState();
            refreshBtn.classList.remove('loading');
            break;

        case 'settings-update':
            currentServers = message.servers;
            renderCurrentView();
            break;

        case 'install-success':
            showNotification(`Successfully installed ${message.serverId}`, 'success');
            // Refresh data after installation
            vscode.postMessage({ type: 'refresh' });
            break;

        case 'install-error':
            showNotification(`Failed to install ${message.serverId}: ${message.message}`, 'error');
            break;

        case 'uninstall-success':
            showNotification(`Successfully uninstalled ${message.serverId}`, 'success');
            // Refresh data after uninstallation
            vscode.postMessage({ type: 'refresh' });
            break;

        case 'uninstall-error':
            showNotification(`Failed to uninstall ${message.serverId}: ${message.message}`, 'error');
            break;

        case 'error':
            showNotification(`Error: ${message.message}`, 'error');
            hideLoadingState();
            refreshBtn.classList.remove('loading');
            break;
    }
});

// Render functions
function renderCurrentView() {
    if (configuredContent.classList.contains('active')) {
        renderConfiguredServers();
    } else {
        renderMarketplaceServers();
    }
}

function renderConfiguredServers() {
    const content = configuredContent.querySelector('.server-grid');
    if (!content) return;

    // Filter servers based on search query
    const filteredServers = currentServers.configured.filter(server => 
        server.name.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
        (server.state?.status || '').toLowerCase().includes(currentSearchQuery.toLowerCase())
    );

    if (filteredServers.length === 0) {
        content.innerHTML = getEmptyState('No configured MCP servers found');
        return;
    }

    content.innerHTML = filteredServers.map(server => getServerCardHtml(server, 'configured')).join('');

    // Add event listeners
    addServerCardEventListeners();
}

function renderMarketplaceServers() {
    const content = marketplaceContent.querySelector('.server-grid');
    if (!content) return;

    // Filter servers based on search query
    const filteredServers = currentServers.marketplace.filter(server => 
        server.name.toLowerCase().includes(currentSearchQuery.toLowerCase()) ||
        server.description.toLowerCase().includes(currentSearchQuery.toLowerCase())
    );

    if (filteredServers.length === 0) {
        content.innerHTML = getEmptyState('No marketplace MCP servers found');
        return;
    }

    content.innerHTML = filteredServers.map(server => getMarketplaceServerCardHtml(server)).join('');

    // Add event listeners
    addMarketplaceEventListeners();
}

function getServerCardHtml(server, source) {
    const statusClass = `status-${server.state?.status || 'disconnected'}`;
    const statusText = server.state?.status || 'disconnected';

    return `
    <div class="server-card">
        <div class="server-header">
            <div class="server-name">
                ${server.name}
                <span class="source-badge">${source}</span>
                <span class="server-status ${statusClass}">${statusText}</span>
            </div>
        </div>
        <div class="server-description">
            ${server.state?.status === 'connected' ? `
                Connected with ${server.state.toolCount} tools, ${server.state.resourceCount} resources
            ` : 'Not connected'}
        </div>
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-value">${server.state?.toolCount || 0}</div>
                <div class="stat-label">Tools</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${server.state?.resourceCount || 0}</div>
                <div class="stat-label">Resources</div>
            </div>
            <div class="stat-item">
                <div class="stat-value">${server.state?.promptCount || 0}</div>
                <div class="stat-label">Prompts</div>
            </div>
        </div>
        <div class="server-actions">
            ${statusText === 'connected' ? '' : `
                <button class="btn btn-sm reconnect-btn" data-server-id="${server.name}">Reconnect</button>
            `}
            <button class="btn btn-sm btn-danger uninstall-btn" data-server-id="${server.name}">Uninstall</button>
        </div>
        ${server.state?.error ? `
        <div class="notification error" style="margin-top: 10px; padding: 8px;">
            Error: ${server.state.error}
        </div>
        ` : ''}
    </div>
    `;
}

function getMarketplaceServerCardHtml(server) {
    return `
    <div class="server-card">
        <div class="server-header">
            <div class="server-name">
                ${server.name}
                <span class="source-badge">marketplace</span>
            </div>
            <div class="server-version">v${server.version}</div>
        </div>
        <div class="server-description">${server.description}</div>
        <div class="server-meta">
            <div class="server-meta-item">
                📦 ${server.author}
            </div>
            <div class="server-meta-item">
                🏷️ ${server.tags.join(', ')}
            </div>
        </div>
        <div class="server-actions">
            <button class="btn btn-sm btn-primary install-btn" data-server-id="${server.id}">Install</button>
        </div>
    </div>
    `;
}

function getEmptyState(message) {
    return `
    <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>${message}</h3>
        <p>Try adjusting your search or refresh the list</p>
    </div>
    `;
}

// Event listeners for server cards
function addServerCardEventListeners() {
    // Reconnect buttons
    document.querySelectorAll('.reconnect-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serverId = btn.getAttribute('data-server-id');
            vscode.postMessage({ type: 'reconnect', serverId });
        });
    });

    // Uninstall buttons
    document.querySelectorAll('.uninstall-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serverId = btn.getAttribute('data-server-id');
            vscode.postMessage({ type: 'uninstall', serverId });
        });
    });
}

// Event listeners for marketplace cards
function addMarketplaceEventListeners() {
    // Install buttons
    document.querySelectorAll('.install-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const serverId = btn.getAttribute('data-server-id');
            vscode.postMessage({ type: 'install', serverId });
        });
    });
}

// UI helpers
function showLoadingState() {
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading-overlay';
    loadingElement.innerHTML = '<div class="loading-spinner"></div><p>Loading MCP servers...</p>';
    document.body.appendChild(loadingElement);
}

function hideLoadingState() {
    const loadingOverlay = document.querySelector('.loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.bottom = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '1000';
    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initial load
vscode.postMessage({ type: 'refresh' });