import { TaskManager } from '../agent/task_manager';

// Test the fixed task lifecycle
async function testTaskLifecycle() {
    console.log('Testing fixed task lifecycle...');
    
    const taskManager = new TaskManager();
    
    // 1. Create a task with steps
    console.log('\n1. Creating task...');
    const task = taskManager.createTask('Test Task Lifecycle', [
        'Create test file',
        'Write content to file',
        'Verify content'
    ]);
    
    console.log('Task created:', task.title);
    console.log('Task steps:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 2. Update step status
    console.log('\n2. Updating first step to in-progress...');
    taskManager.updateStepStatus(task.id, 0, 'in-progress');
    
    console.log('Task steps after update:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 3. Update step status to completed
    console.log('\n3. Updating first step to completed...');
    taskManager.updateStepStatus(task.id, 0, 'completed');
    
    console.log('Task steps after update:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 4. Update task status to completed
    console.log('\n4. Updating task to completed...');
    taskManager.updateTaskStatus(task.id, 'completed');
    
    console.log('Final task status:', task.status);
    
    // 5. List all tasks
    console.log('\n5. Listing all tasks...');
    const tasks = taskManager.listTasks();
    tasks.forEach(t => {
        console.log(`Task: ${t.title} [${t.status}]`);
        t.steps.forEach((step, index) => {
            console.log(`  Step ${index + 1}: ${step.description} [${step.status}]`);
        });
    });
    
    console.log('\nTest completed successfully!');
}

// Run the test
try {
    testTaskLifecycle();
} catch (error) {
    console.error('Test failed:', error);
}