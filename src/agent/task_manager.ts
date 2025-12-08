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
    getCurrentStep(taskId: string): TaskStep | null {
        const task = this.tasks.get(taskId);
        if (!task) return null;
        
        // Find first pending or in-progress step
        const currentStep = task.steps.find(step => step.status === 'in-progress' || step.status === 'pending');
        return currentStep || null;
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
        task.progress = progress;
        
        return task;
    }

    getTask(id: string): Task | undefined {
        return this.tasks.get(id);
    }

    listTasks(): Task[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    // For serialization if we add persistence later
    toJSON() {
        return Array.from(this.tasks.values());
    }
}
