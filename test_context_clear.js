// Test script to verify context clearing functionality
const { ContextManager } = require('./src/agent/context_manager');

// Create a context manager
const contextManager = new ContextManager();

// Add some test context
contextManager.addToMasterContext('test_key_1', 'This is test content 1');
contextManager.addToMasterContext('test_key_2', 'This is test content 2');

console.log('Before clearing:');
console.log('Context size:', contextManager.getAllMasterContext().size);
console.log('Context items:', Array.from(contextManager.getAllMasterContext().keys()));

// Clear the context
contextManager.clearMasterContext();

console.log('\nAfter clearing:');
console.log('Context size:', contextManager.getAllMasterContext().size);
console.log('Context items:', Array.from(contextManager.getAllMasterContext().keys()));

if (contextManager.getAllMasterContext().size === 0) {
    console.log('\n✅ Context clearing works correctly!');
} else {
    console.log('\n❌ Context clearing failed!');
    process.exit(1);
}