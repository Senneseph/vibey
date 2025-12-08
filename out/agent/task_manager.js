"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskManager = void 0;
const crypto = __importStar(require("crypto"));
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
                status: 'pending',
                createdAt: Date.now()
            })),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this.tasks.set(id, task);
        return task;
    }
    updateTaskStatus(id, status) {
        const task = this.tasks.get(id);
        if (task) {
            task.status = status;
            task.updatedAt = Date.now();
            this.tasks.set(id, task);
        }
        return task;
    }
    updateStepStatus(taskId, stepIndex, status) {
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
    createAtomicChangeTask(title, description, contextItems) {
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
    getTaskProgress(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return null;
        const totalSteps = task.steps.length;
        if (totalSteps === 0)
            return { completedSteps: 0, totalSteps: 0, percentage: 0 };
        const completedSteps = task.steps.filter(step => step.status === 'completed').length;
        const percentage = Math.round((completedSteps / totalSteps) * 100);
        return { completedSteps, totalSteps, percentage };
    }
    // Method to get current task step
    getCurrentStep(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return null;
        // Find first pending or in-progress step
        const currentStep = task.steps.find(step => step.status === 'in-progress' || step.status === 'pending');
        return currentStep || null;
    }
    // Method to mark a step as in-progress
    startStep(taskId, stepIndex) {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined)
            return false;
        // Only allow starting a pending step
        if (task.steps[stepIndex].status !== 'pending')
            return false;
        task.steps[stepIndex].status = 'in-progress';
        task.steps[stepIndex].startedAt = Date.now();
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        return true;
    }
    // Method to mark a step as completed
    completeStep(taskId, stepIndex) {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined)
            return false;
        // Only allow completing an in-progress step
        if (task.steps[stepIndex].status !== 'in-progress')
            return false;
        task.steps[stepIndex].status = 'completed';
        task.steps[stepIndex].completedAt = Date.now();
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        return true;
    }
    // Method to get task with detailed progress
    getDetailedTask(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return undefined;
        const progress = this.getTaskProgress(taskId);
        task.progress = progress;
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