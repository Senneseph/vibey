
import { z } from 'zod';
import { ToolDefinition } from '../schema';
import { TaskManager } from '../../agent/task_manager';

export const createManageTaskTool = (taskManager: TaskManager): ToolDefinition => {
    return {
        name: 'manage_task',
        description: 'Create, update, or list tasks to track complex goals. Use this to break down large user requests into steps.',
        parameters: z.object({
            action: z.enum(['create', 'update_status', 'update_step', 'list']).describe('The action to perform'),
            title: z.string().optional().describe('Title for new task'),
            steps: z.array(z.string()).optional().describe('List of step descriptions for new task'),
            taskId: z.string().optional().describe('ID of the task to update'),
            status: z.enum(['pending', 'in-progress', 'completed', 'failed']).optional().describe('New status for task or step'),
            stepIndex: z.number().optional().describe('Index of the step to update (0-based)')
        }),
        execute: async (args) => {
            if (args.action === 'create') {
                if (!args.title) throw new Error('Title required for create');
                const task = taskManager.createTask(args.title, args.steps || []);
                return `Task created: [${task.id}] ${task.title}`;
            }

            if (args.action === 'list') {
                const tasks = taskManager.listTasks();
                return JSON.stringify(tasks, null, 2);
            }

            if (args.action === 'update_status') {
                if (!args.taskId || !args.status) throw new Error('taskId and status required');
                const task = taskManager.updateTaskStatus(args.taskId, args.status as any);
                if (!task) return `Task ${args.taskId} not found`;
                return `Task ${args.taskId} status updated to ${args.status}`;
            }

            if (args.action === 'update_step') {
                if (!args.taskId || args.stepIndex === undefined || !args.status) throw new Error('taskId, stepIndex, and status required');
                const task = taskManager.updateStepStatus(args.taskId, args.stepIndex, args.status as any);
                if (!task) return `Task ${args.taskId} not found or step invalid`;
                return `Task ${args.taskId} step ${args.stepIndex} updated to ${args.status}`;
            }

            return 'Invalid action';
        }
    };
};
