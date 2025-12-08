"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
const crypto = require("crypto");
class TaskManager {
    constructor() {
        this.tasks = new Map();
    }
    createTask(title, steps = []) {
        const id = crypto.randomUUID();
        const task = {
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
    updateTaskStatus(id, status) {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            this.tasks.set(id, task);
        }
        return task;
    }
    updateStepStatus(taskId, stepIndex, status) {
        const task = this.tasks.get(taskId);
        if (task && task.steps[stepIndex]) {
            task.steps[stepIndex].status = status;
            this.tasks.set(taskId, task); // redundant map set but safe
        }
        return task;
    }
    getTask(id) {
        return this.tasks.get(id);
    }
    listTasks() {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }
    // For serialization if we add persistence later
    toJSON() {
        return Array.from(this.tasks.values());
    }
}
exports.TaskManager = TaskManager;
//# sourceMappingURL=task_manager.js.map