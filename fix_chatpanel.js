// Simple script to fix the ChatPanel.ts file
const fs = require('fs');

// Read the file
const content = fs.readFileSync('src/ui/ChatPanel.ts', 'utf8');

// Replace the tooltip text
const oldText = 'title=\\"Select Model\\">🤖</button>';
const newText = 'title=\\"Select Model/Clear Context\\">🤖</button>';

const newContent = content.replace(oldText, newText);

// Write back if changed
if (newContent !== content) {
    fs.writeFileSync('src/ui/ChatPanel.ts', newContent);
    console.log('Successfully updated ChatPanel.ts');
} else {
    console.log('No changes needed or pattern not found');
}