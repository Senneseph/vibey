import { Task, TaskStatus } from './types';
import * as crypto from 'crypto';

export class TaskManager {
    private tasks: Map<string, Task> = new Map();

    constructor() { }

    createTask(title: string, steps: string[] = []): Task {
        const id = crypto.randomUUID();
        const task: Task = {
            id,
            title,
            status: 'pending',
            steps: steps.map(desc => ({
                id: crypto.randomUUID(),
                description: desc,
                status: 'pending',
                createdAt: Date.now()
            })),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.tasks.set(id, task);
        return task;
    }

    updateTaskStatus(id: string, status: TaskStatus): Task | undefined {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            task.updatedAt = Date.now();
            this.tasks.set(id, task);
        }
        return task;
    }

    updateStepStatus(taskId: string, stepIndex: number, status: TaskStatus): Task | undefined {
        const task = this.tasks.get(taskId);
        if (task && task.steps[stepIndex]) {
            task.steps[stepIndex].status = status;
            task.steps[stepIndex].updatedAt = Date.now();
            task.updatedAt = Date.now();
            this.tasks.set(taskId, task);
            return task;
        }
        return undefined;
    }

    // New method for atomic change tracking
    createAtomicChangeTask(title: string, description: string, contextItems?: string[]): Task {
        const task = this.createTask(title, [
            'Analyze requirements',
            'Plan atomic changes',
            'Implement changes',
            'Verify changes',
            'Document changes'
        ]);
        
        // Update task metadata
        task.description = description;
        task.contextItems = contextItems || [];
        
        return task;
    }

    // Method to get task progress
    getTaskProgress(taskId: string): { completedSteps: number; totalSteps: number; percentage: number } | null {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        const totalSteps = task.steps.length;
        if (totalSteps === 0) return { completedSteps: 0, totalSteps: 0, percentage: 0 };
        
        const completedSteps = task.steps.filter(step => step.status === 'completed').length;
        const percentage = Math.round((completedSteps / totalSteps) * 100);
        
        return { completedSteps, totalSteps, percentage };
    }

    // Method to get current task step
    getCurrentStep(taskId: string): Task | undefined {
        const task = this.tasks.get(taskId);
        if (!task) return undefined;
        
        // Find first pending or in-progress step
        const currentStep = task.steps.find(step => step.status === 'in-progress' || step.status === 'pending');
        
        // Return the task with the current step information
        if (currentStep) {
            return task;
        }
        
        return task;
    }

    // Method to mark a step as in-progress
    startStep(taskId: string, stepIndex: number): boolean {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined) return false;
        
        // Only allow starting a pending step
        if (task.steps[stepIndex].status !== 'pending') return false;
        
        task.steps[stepIndex].status = 'in-progress';
        task.steps[stepIndex].startedAt = Date.now();
        task.updatedAt = Date.now();
        
        this.tasks.set(taskId, task);
        return true;
    }

    // Method to mark a step as completed
    completeStep(taskId: string, stepIndex: number): boolean {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined) return false;
        
        // Only allow completing an in-progress step
        if (task.steps[stepIndex].status !== 'in-progress') return false;
        
        task.steps[stepIndex].status = 'completed';
        task.steps[stepIndex].completedAt = Date.now();
        task.updatedAt = Date.now();
        
        this.tasks.set(taskId, task);
        return true;
    }

    // Method to get task with detailed progress
    getDetailedTask(taskId: string): Task | undefined {
        const task = this.tasks.get(taskId);
        if (!task) return undefined;
        
        const progress = this.getTaskProgress(taskId);
        if (progress) {
            task.progress = progress;
        }
        
        return task;
    }

    getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    listTasks(): Task[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    // NEW: Enhanced task management for iterative problem-solving
    
    // Create a task with checkpoints for iterative problem-solving
    createIterativeTask(title: string, steps: string[], initialContextItems?: string[]): Task {
        const task = this.createTask(title, steps);
        task.contextItems = initialContextItems || [];
        task.status = 'in-progress';
        
        // Add a checkpoint step to track progress
        task.steps.push({
            id: crypto.randomUUID(),
            description: 'Checkpoint - Review progress and plan next steps',
            status: 'pending',
            createdAt: Date.now()
        });
        
        return task;
    }
    
    // Mark a specific step as requiring additional context
    requireContext(taskId: string, stepIndex: number, contextDescription: string): boolean {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined) return false;
        
        // Add context requirement to the step
        if (!task.steps[stepIndex].contextRequired) {
            task.steps[stepIndex].contextRequired = contextDescription;
        }
        
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        return true;
    }
    
    // Method to get all context items required by a task
    getRequiredContext(taskId: string): string[] {
        const task = this.tasks.get(taskId);
        if (!task) return [];
        
        const requiredContext: string[] = [];
        
        for (const step of task.steps) {
            if (step.contextRequired) {
                requiredContext.push(step.contextRequired);
            }
        }
        
        return requiredContext;
    }
    
    // Method to add context items to a task
    addContextToTask(taskId: string, contextItems: string[]): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        
        if (!task.contextItems) {
            task.contextItems = [];
        }
        
        task.contextItems = [...task.contextItems, ...contextItems];
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        
        return true;
    }

    // NEW: Checkpoint functionality
    
    // Create a checkpoint for a task with summary of completed work
    createCheckpoint(taskId: string, summary: string, completedSteps?: number[]): boolean {
        const task = this.tasks.get(taskId);
        if (!task) return false;
        
        // Add checkpoint information to task metadata
        if (!task.checkpoints) {
            task.checkpoints = [];
        }
        
        const checkpoint = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            summary: summary,
            completedSteps: completedSteps || [],
            stepsCount: task.steps.length
        };
        
        task.checkpoints.push(checkpoint);
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        
        return true;
    }
    
    // Get task checkpoints
    getTaskCheckpoints(taskId: string): any[] {
        const task = this.tasks.get(taskId);
        if (!task || !task.checkpoints) return [];
        
        return task.checkpoints;
    }
    
    // Get recent checkpoints for task summary
    getTaskSummary(taskId: string): string {
        const task = this.tasks.get(taskId);
        if (!task) return 'Task not found';
        
        let summary = `Task: ${task.title}\nStatus: ${task.status}\nProgress: ${task.progress?.percentage || 0}%\n\n`;
        
        if (task.checkpoints && task.checkpoints.length > 0) {
            summary += 'Checkpoints:\n';
            task.checkpoints.forEach((checkpoint, index) => {
                summary += `  ${index + 1}. ${new Date(checkpoint.timestamp).toLocaleString()}: ${checkpoint.summary}\n`;
            });
        } else {
            summary += 'No checkpoints recorded yet.\n';
        }
        
        return summary;
    }
    
    // For serialization if we add persistence later
    toJSON() {
        return Array.from(this.tasks.values());
    }
    
    // Helper method to get a summary of completed work for context management
    getCompletedWorkSummary(taskId: string): string {
        const task = this.tasks.get(taskId);
        if (!task) return 'Task not found';
        
        const completedSteps = task.steps
            .filter(step => step.status === 'completed')
            .map(step => step.description);
        
        if (completedSteps.length === 0) return 'No work completed yet.';
        
        return `Completed steps: ${completedSteps.join('; ')}`;
    }
}
