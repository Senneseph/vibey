import { TaskManager } from '../agent/task_manager';

// Test the enhanced task lifecycle with atomic changes
async function testEnhancedTaskLifecycle() {
    console.log('Testing enhanced task lifecycle with atomic changes...');
    
    const taskManager = new TaskManager();
    
    // 1. Create an atomic change task
    console.log('\n1. Creating atomic change task...');
    const task = taskManager.createAtomicChangeTask(
        'Implement new feature',
        'Add user authentication system with login and registration',
        ['src/components/LoginForm.tsx', 'src/api/auth.ts']
    );
    
    console.log('Task created:', task.title);
    console.log('Task description:', task.description);
    console.log('Task context items:', task.contextItems);
    console.log('Task steps:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 2. Get initial progress
    console.log('\n2. Getting initial progress...');
    const progress = taskManager.getTaskProgress(task.id);
    console.log('Task progress:', progress);
    
    // 3. Start first step
    console.log('\n3. Starting first step...');
    taskManager.startStep(task.id, 0);
    
    console.log('Task steps after starting first step:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 4. Get progress after starting step
    console.log('\n4. Getting progress after starting step...');
    const progressAfterStart = taskManager.getTaskProgress(task.id);
    console.log('Task progress:', progressAfterStart);
    
    // 5. Complete first step
    console.log('\n5. Completing first step...');
    taskManager.completeStep(task.id, 0);
    
    console.log('Task steps after completing first step:');
    task.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.description} [${step.status}]`);
    });
    
    // 6. Get progress after completing step
    console.log('\n6. Getting progress after completing step...');
    const progressAfterComplete = taskManager.getTaskProgress(task.id);
    console.log('Task progress:', progressAfterComplete);
    
    // 7. Update task status to completed
    console.log('\n7. Updating task to completed...');
    taskManager.updateTaskStatus(task.id, 'completed');
    
    console.log('Final task status:', task.status);
    
    // 8. List all tasks
    console.log('\n8. Listing all tasks...');
    const tasks = taskManager.listTasks();
    tasks.forEach(t => {
        console.log(`Task: ${t.title} [${t.status}]`);
        t.steps.forEach((step, index) => {
            console.log(`  Step ${index + 1}: ${step.description} [${step.status}]`);
        });
        if (t.progress) {
            console.log(`  Progress: ${t.progress.completedSteps}/${t.progress.totalSteps} (${t.progress.percentage}%)`);
        }
    });
    
    console.log('\nTest completed successfully!');
}

// Run the test
try {
    testEnhancedTaskLifecycle();
} catch (error) {
    console.error('Test failed:', error);
}