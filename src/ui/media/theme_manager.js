import { vscode } from './vscode_api.js';

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

// Initialize theme manager (call from main.js initApp)
function initThemeManager() {
    // Apply initial theme
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
}

// Export for use in other modules
export { applyTheme, initThemeManager };