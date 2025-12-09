import { ContextManager } from '../agent/context_manager';

// Test the checkpoint functionality
async function testCheckpoints() {
    const contextManager = new ContextManager();
    
    // Add some test context
    contextManager.addToMasterContext('task_description', 'Implement user authentication system');
    contextManager.addToMasterContext('context_src/auth/login.ts', 'Login component implementation');
    contextManager.addToMasterContext('context_src/auth/register.ts', 'Registration component implementation');
    
    console.log('Initial context summary:');
    console.log(contextManager.getContextSummary());
    
    // Create a checkpoint for completed work
    const checkpoint = contextManager.createCheckpoint(
        'Completed authentication component analysis',
        ['src/auth/login.ts', 'src/auth/register.ts']
    );
    
    console.log('\nCreated checkpoint:', checkpoint.id);
    
    // Review checkpoints
    contextManager.reviewCheckpointContext();
    
    // Clear context for that checkpoint
    contextManager.clearCheckpointContext(checkpoint.id);
    
    console.log('\nContext after clearing checkpoint:');
    console.log(contextManager.getContextSummary());
    
    // Create another checkpoint
    const secondCheckpoint = contextManager.createCheckpoint(
        'Completed API integration',
        ['src/api/auth.ts']
    );
    
    console.log('\nSecond checkpoint created:', secondCheckpoint.id);
    
    // Show all checkpoints
    const allCheckpoints = contextManager.getCheckpoints();
    console.log('\nAll checkpoints:');
    allCheckpoints.forEach(cp => {
        console.log(`- ${cp.id}: ${cp.description}`);
    });
}

// Run the test
try {
    testCheckpoints();
    console.log('\nCheckpoint test completed successfully!');
} catch (error) {
    console.error('Test failed:', error);
}
