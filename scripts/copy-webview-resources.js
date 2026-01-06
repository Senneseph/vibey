#!/usr/bin/env node

/**
 * Script to copy webview-ui-toolkit resources to a location that will be included in the VSIX
 * This ensures the extension works offline without requiring CDN access
 */

const fs = require('fs');
const path = require('path');

// Source and destination paths
const sourceDir = path.join(__dirname, '..', 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist');
const destDir = path.join(__dirname, '..', 'src', 'ui', 'webview-ui-toolkit');

console.log('Copying webview-ui-toolkit resources...');
console.log(`Source: ${sourceDir}`);
console.log(`Destination: ${destDir}`);

try {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        console.log(`Created destination directory: ${destDir}`);
    }

    // Copy the toolkit.min.js file
    const sourceFile = path.join(sourceDir, 'toolkit.min.js');
    const destFile = path.join(destDir, 'toolkit.min.js');
    
    if (fs.existsSync(sourceFile)) {
        fs.copyFileSync(sourceFile, destFile);
        console.log(`Copied: ${sourceFile} -> ${destFile}`);
    } else {
        console.error(`Source file not found: ${sourceFile}`);
        process.exit(1);
    }

    // Copy any CSS files if they exist
    const cssFiles = ['toolkit.min.css', 'theme.css', 'styles.css'];
    for (const cssFile of cssFiles) {
        const sourceCss = path.join(sourceDir, cssFile);
        if (fs.existsSync(sourceCss)) {
            const destCss = path.join(destDir, cssFile);
            fs.copyFileSync(sourceCss, destCss);
            console.log(`Copied: ${sourceCss} -> ${destCss}`);
        }
    }

    console.log('✅ Webview UI toolkit resources copied successfully!');
    console.log('Update your .vscodeignore to include these files in the VSIX package.');

} catch (error) {
    console.error('❌ Error copying webview-ui-toolkit resources:', error);
    process.exit(1);
}