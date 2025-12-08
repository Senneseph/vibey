
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
                status: 'pending'
            })),
            createdAt: Date.now()
        };
        this.tasks.set(id, task);
        return task;
    }

    updateTaskStatus(id: string, status: TaskStatus): Task | undefined {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            this.tasks.set(id, task);
        }
        return task;
    }

    updateStepStatus(taskId: string, stepIndex: number, status: TaskStatus): Task | undefined {
        const task = this.tasks.get(taskId);
        if (task && task.steps[stepIndex]) {
            task.steps[stepIndex].status = status;
            this.tasks.set(taskId, task); // redundant map set but safe
        }
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
