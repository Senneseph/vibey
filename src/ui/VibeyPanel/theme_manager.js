// Theme Manager - Handles theme switching and application

// Apply theme based on current VSCode theme
function applyTheme() {
    const body = document.body;
    const currentTheme = document.body.getAttribute('data-vscode-theme-kind');
    
    if (currentTheme === 'vscode-dark') {
        body.classList.add('theme-dark');
        body.classList.remove('theme-light');
    } else if (currentTheme === 'vscode-light') {
        body.classList.add('theme-light');
        body.classList.remove('theme-dark');
    } else {
        // Default to dark theme if unknown
        body.classList.add('theme-dark');
        body.classList.remove('theme-light');
    }
}

// Initialize theme manager
function initThemeManager() {
    // Apply initial theme
    applyTheme();
    
    // Set up theme change listener
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'themeChange') {
            applyTheme();
        }
    });
}

export { applyTheme, initThemeManager };