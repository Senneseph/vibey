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
            return undefined;
        // Find first pending or in-progress step
        const currentStep = task.steps.find(step => step.status === 'in-progress' || step.status === 'pending');
        // Return the task with the current step information
        if (currentStep) {
            return task;
        }
        return task;
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
        if (progress) {
            task.progress = progress;
        }
        return task;
    }
    getTask(id) {
        return this.tasks.get(id);
    }
    listTasks() {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }
    // NEW: Enhanced task management for iterative problem-solving
    // Create a task with checkpoints for iterative problem-solving
    createIterativeTask(title, steps, initialContextItems) {
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
    requireContext(taskId, stepIndex, contextDescription) {
        const task = this.tasks.get(taskId);
        if (!task || task.steps[stepIndex] === undefined)
            return false;
        // Add context requirement to the step
        if (!task.steps[stepIndex].contextRequired) {
            task.steps[stepIndex].contextRequired = contextDescription;
        }
        task.updatedAt = Date.now();
        this.tasks.set(taskId, task);
        return true;
    }
    // Method to get all context items required by a task
    getRequiredContext(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return [];
        const requiredContext = [];
        for (const step of task.steps) {
            if (step.contextRequired) {
                requiredContext.push(step.contextRequired);
            }
        }
        return requiredContext;
    }
    // Method to add context items to a task
    addContextToTask(taskId, contextItems) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
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
    createCheckpoint(taskId, summary, completedSteps) {
        const task = this.tasks.get(taskId);
        if (!task)
            return false;
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
    getTaskCheckpoints(taskId) {
        const task = this.tasks.get(taskId);
        if (!task || !task.checkpoints)
            return [];
        return task.checkpoints;
    }
    // Get recent checkpoints for task summary
    getTaskSummary(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return 'Task not found';
        let summary = `Task: ${task.title}\nStatus: ${task.status}\nProgress: ${task.progress?.percentage || 0}%\n\n`;
        if (task.checkpoints && task.checkpoints.length > 0) {
            summary += 'Checkpoints:\n';
            task.checkpoints.forEach((checkpoint, index) => {
                summary += `  ${index + 1}. ${new Date(checkpoint.timestamp).toLocaleString()}: ${checkpoint.summary}\n`;
            });
        }
        else {
            summary += 'No checkpoints recorded yet.\n';
        }
        return summary;
    }
    // For serialization if we add persistence later
    toJSON() {
        return Array.from(this.tasks.values());
    }
    // Helper method to get a summary of completed work for context management
    getCompletedWorkSummary(taskId) {
        const task = this.tasks.get(taskId);
        if (!task)
            return 'Task not found';
        const completedSteps = task.steps
            .filter(step => step.status === 'completed')
            .map(step => step.description);
        if (completedSteps.length === 0)
            return 'No work completed yet.';
        return `Completed steps: ${completedSteps.join('; ')}`;
    }
}
exports.TaskManager = TaskManager;
//# sourceMappingURL=task_manager.js.map