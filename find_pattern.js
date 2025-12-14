// Script to find the exact pattern in ChatPanel.ts
const fs = require('fs');

// Read the file
const content = fs.readFileSync('src/ui/ChatPanel.ts', 'utf8');

// Search for patterns
const patterns = [
    'Select Model',
    'title=\\"Select Model\\"',
    'title="Select Model"',
    'models-btn'
];

console.log('Searching for patterns in ChatPanel.ts:');
patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
        console.log(`Found: "${pattern}" - ${matches.length} occurrences`);
        
        // Show context around first match
        const index = content.indexOf(pattern);
        if (index > 0) {
            const start = Math.max(0, index - 50);
            const end = Math.min(content.length, index + 100);
            console.log(`Context: ${content.substring(start, end)}`);
            console.log('---');
        }
    } else {
        console.log(`Not found: "${pattern}"`);
    }
});