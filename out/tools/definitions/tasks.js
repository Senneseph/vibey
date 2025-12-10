"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createManageTaskTool = void 0;
const zod_1 = require("zod");
const createManageTaskTool = (taskManager) => {
    return {
        name: 'manage_task',
        description: 'Create, update, or list tasks to track complex goals. Use this to break down large user requests into steps. Supports atomic changes tracking and checkpoint management.',
        parameters: zod_1.z.object({
            action: zod_1.z.enum(['create', 'update_status', 'update_step', 'list', 'create_atomic_change', 'get_progress', 'start_step', 'complete_step', 'create_checkpoint', 'get_summary']).describe('The action to perform'),
            title: zod_1.z.string().optional().describe('Title for new task'),
            description: zod_1.z.string().optional().describe('Description for atomic change task'),
            steps: zod_1.z.array(zod_1.z.string()).optional().describe('List of step descriptions for new task'),
            taskId: zod_1.z.string().optional().describe('ID of the task to update'),
            status: zod_1.z.enum(['pending', 'in-progress', 'completed', 'failed']).optional().describe('New status for task or step'),
            stepIndex: zod_1.z.number().optional().describe('Index of the step to update (0-based)'),
            contextItems: zod_1.z.array(zod_1.z.string()).optional().describe('List of context items for atomic change task'),
            summary: zod_1.z.string().optional().describe('Summary of work completed at checkpoint'),
            completedSteps: zod_1.z.array(zod_1.z.number()).optional().describe('List of completed step indices to track in checkpoint')
        }),
        execute: async (args) => {
            if (args.action === 'create') {
                if (!args.title)
                    throw new Error('Title required for create');
                const task = taskManager.createTask(args.title, args.steps || []);
                return `Task created: [${task.id}] ${task.title}`;
            }
            if (args.action === 'list') {
                const tasks = taskManager.listTasks();
                return JSON.stringify(tasks, null, 2);
            }
            if (args.action === 'update_status') {
                if (!args.taskId || !args.status)
                    throw new Error('taskId and status required');
                const task = taskManager.updateTaskStatus(args.taskId, args.status);
                if (!task)
                    return `Task ${args.taskId} not found`;
                return `Task ${args.taskId} status updated to ${args.status}`;
            }
            if (args.action === 'update_step') {
                if (!args.taskId || args.stepIndex === undefined || !args.status)
                    throw new Error('taskId, stepIndex, and status required');
                const task = taskManager.updateStepStatus(args.taskId, args.stepIndex, args.status);
                if (!task)
                    return `Task ${args.taskId} not found or step invalid`;
                return `Task ${args.taskId} step ${args.stepIndex} updated to ${args.status}`;
            }
            if (args.action === 'create_atomic_change') {
                if (!args.title)
                    throw new Error('Title required for atomic change task');
                const task = taskManager.createAtomicChangeTask(args.title, args.description || '', args.contextItems || []);
                return `Atomic change task created: [${task.id}] ${task.title}`;
            }
            if (args.action === 'get_progress') {
                if (!args.taskId)
                    throw new Error('taskId required');
                const progress = taskManager.getTaskProgress(args.taskId);
                if (!progress)
                    return `Task ${args.taskId} not found`;
                return JSON.stringify(progress, null, 2);
            }
            if (args.action === 'start_step') {
                if (!args.taskId || args.stepIndex === undefined)
                    throw new Error('taskId and stepIndex required');
                const success = taskManager.startStep(args.taskId, args.stepIndex);
                if (!success)
                    return `Failed to start step ${args.stepIndex} for task ${args.taskId}`;
                return `Step ${args.stepIndex} started for task ${args.taskId}`;
            }
            if (args.action === 'complete_step') {
                if (!args.taskId || args.stepIndex === undefined)
                    throw new Error('taskId and stepIndex required');
                const success = taskManager.completeStep(args.taskId, args.stepIndex);
                if (!success)
                    return `Failed to complete step ${args.stepIndex} for task ${args.taskId}`;
                return `Step ${args.stepIndex} completed for task ${args.taskId}`;
            }
            if (args.action === 'create_checkpoint') {
                if (!args.taskId || !args.summary)
                    throw new Error('taskId and summary required for checkpoint');
                const success = taskManager.createCheckpoint(args.taskId, args.summary, args.completedSteps);
                if (!success)
                    return `Failed to create checkpoint for task ${args.taskId}`;
                return `Checkpoint created for task ${args.taskId}`;
            }
            if (args.action === 'get_summary') {
                if (!args.taskId)
                    throw new Error('taskId required');
                const summary = taskManager.getTaskSummary(args.taskId);
                return summary;
            }
            return 'Invalid action';
        }
    };
};
exports.createManageTaskTool = createManageTaskTool;
//# sourceMappingURL=tasks.js.map