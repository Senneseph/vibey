const fs = require('fs');
const path = require('path');

// Check if the .vibey directory exists
const vibeyDir = '.vibey';

if (!fs.existsSync(vibeyDir)) {
  console.log('❌ .vibey directory does not exist');
  console.log('This is likely why chat history is not showing up');
  process.exit(1);
}

console.log('✅ .vibey directory exists');

// Check if chat_history.json exists
const chatHistoryPath = path.join(vibeyDir, 'chat_history.json');
if (!fs.existsSync(chatHistoryPath)) {
  console.log('❌ chat_history.json does not exist');
  console.log('This is likely why chat history is not showing up');
  process.exit(1);
}

console.log('✅ chat_history.json exists');

// Check if sessions.json exists
const sessionsPath = path.join(vibeyDir, 'sessions.json');
if (!fs.existsSync(sessionsPath)) {
  console.log('❌ sessions.json does not exist');
  console.log('This is likely why chat history is not showing up');
  process.exit(1);
}

console.log('✅ sessions.json exists');

// Try to read and parse chat_history.json
try {
  const chatHistoryContent = fs.readFileSync(chatHistoryPath, 'utf8');
  const chatHistory = JSON.parse(chatHistoryContent);
  console.log('✅ chat_history.json is valid JSON');
  console.log('Chat history contains', chatHistory.length, 'messages');
} catch (error) {
  console.log('❌ chat_history.json is invalid JSON:', error.message);
  process.exit(1);
}

// Try to read and parse sessions.json
try {
  const sessionsContent = fs.readFileSync(sessionsPath, 'utf8');
  const sessions = JSON.parse(sessionsContent);
  console.log('✅ sessions.json is valid JSON');
  console.log('Sessions contains', sessions.length, 'sessions');
} catch (error) {
  console.log('❌ sessions.json is invalid JSON:', error.message);
  process.exit(1);
}

console.log('✅ All checks passed - history files are valid');