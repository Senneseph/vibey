/**
 * Advanced Planning System
 * Manages hierarchical plans with dependencies, priorities, and learning
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
    Plan, PlanTask, PlanStatus, TaskPriority, TaskType,
    PlanCreateOptions, TaskCreateOptions, TaskDependency,
    TaskOutcome, PlanningContext, PlanDecomposition
} from './types';

export class Planner {
    private plans: Map<string, Plan> = new Map();
    private tasks: Map<string, PlanTask> = new Map();
    private learnings: string[] = [];
    
    private static readonly STORAGE_KEY = 'vibey.planning.data';

    constructor(private context: vscode.ExtensionContext) {
        this.loadState();
    }

    // ==================== Plan Management ====================

    createPlan(options: PlanCreateOptions): Plan {
        const plan: Plan = {
            id: crypto.randomUUID(),
            name: options.name,
            description: options.description,
            status: 'draft',
            primaryGoal: options.primaryGoal,
            successCriteria: options.successCriteria || [],
            rootTaskIds: [],
            totalTasks: 0,
            completedTasks: 0,
            progress: 0,
            category: options.category,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        this.plans.set(plan.id, plan);
        this.saveState();
        return plan;
    }

    getPlan(id: string): Plan | undefined {
        return this.plans.get(id);
    }

    listPlans(status?: PlanStatus): Plan[] {
        const plans = Array.from(this.plans.values());
        if (status) {
            return plans.filter(p => p.status === status);
        }
        return plans.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    updatePlanStatus(planId: string, status: PlanStatus): Plan | undefined {
        const plan = this.plans.get(planId);
        if (!plan) return undefined;
        
        plan.status = status;
        plan.updatedAt = Date.now();
        
        if (status === 'active' && !plan.startedAt) {
            plan.startedAt = Date.now();
        }
        if (status === 'completed' || status === 'failed') {
            plan.completedAt = Date.now();
        }
        
        this.saveState();
        return plan;
    }

    // ==================== Task Management ====================

    createTask(planId: string, options: TaskCreateOptions): PlanTask {
        const task: PlanTask = {
            id: crypto.randomUUID(),
            type: options.type || 'task',
            title: options.title,
            description: options.description,
            status: 'draft',
            priority: options.priority || 'medium',
            parentId: options.parentId,
            childIds: [],
            dependencies: options.dependencies || [],
            blockedBy: [],
            toolsRequired: options.toolsRequired,
            metrics: {
                attempts: 0,
                estimatedDuration: options.estimatedDuration
            },
            tags: options.tags || [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.tasks.set(task.id, task);

        // Link to parent or plan root
        if (options.parentId) {
            const parent = this.tasks.get(options.parentId);
            if (parent) {
                parent.childIds.push(task.id);
                parent.updatedAt = Date.now();
            }
        } else {
            const plan = this.plans.get(planId);
            if (plan) {
                plan.rootTaskIds.push(task.id);
                plan.totalTasks++;
                plan.updatedAt = Date.now();
            }
        }

        this.updateBlockedBy(task);
        this.saveState();
        return task;
    }

    getTask(id: string): PlanTask | undefined {
        return this.tasks.get(id);
    }

    updateTaskStatus(taskId: string, status: PlanStatus, outcome?: TaskOutcome): PlanTask | undefined {
        const task = this.tasks.get(taskId);
        if (!task) return undefined;

        task.status = status;
        task.updatedAt = Date.now();
        task.metrics.attempts++;

        if (outcome) {
            task.outcome = outcome;
            if (outcome.learnings) {
                this.learnings.push(...outcome.learnings);
            }
        }

        if (status === 'completed') {
            task.metrics.completedAt = Date.now();
            if (task.metrics.lastAttemptAt) {
                task.metrics.actualDuration = Date.now() - task.metrics.lastAttemptAt;
            }
            this.updatePlanProgress(task);
        }

        if (status === 'active') {
            task.metrics.lastAttemptAt = Date.now();
        }

        this.recalculateBlockedTasks();
        this.saveState();
        return task;
    }

    // ==================== Query Methods ====================

    getNextTasks(planId?: string, limit: number = 5): PlanTask[] {
        let candidates = Array.from(this.tasks.values())
            .filter(t => t.status === 'draft' || t.status === 'active')
            .filter(t => t.blockedBy.length === 0);

        if (planId) {
            const planTaskIds = this.getTaskIdsForPlan(planId);
            candidates = candidates.filter(t => planTaskIds.has(t.id));
        }

        // Sort by priority, then by creation date
        const priorityOrder: Record<TaskPriority, number> = {
            critical: 0, high: 1, medium: 2, low: 3
        };

        return candidates
            .sort((a, b) => {
                const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (pDiff !== 0) return pDiff;
                return a.createdAt - b.createdAt;
            })
            .slice(0, limit);
    }

    getBlockedTasks(): PlanTask[] {
        return Array.from(this.tasks.values())
            .filter(t => t.blockedBy.length > 0 && t.status !== 'completed');
    }

    getContext(): PlanningContext {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStart = today.getTime();

        return {
            currentPlan: this.listPlans('active')[0],
            activeTasks: Array.from(this.tasks.values()).filter(t => t.status === 'active'),
            blockedTasks: this.getBlockedTasks(),
            completedToday: Array.from(this.tasks.values())
                .filter(t => t.metrics.completedAt && t.metrics.completedAt >= todayStart),
            learnings: [...this.learnings]
        };
    }

    // ==================== Decomposition (for LLM integration) ====================

    suggestDecomposition(planId: string): PlanDecomposition | undefined {
        const plan = this.plans.get(planId);
        if (!plan) return undefined;

        const tasks = this.getTasksForPlan(planId);
        const order = this.topologicalSort(tasks);

        return {
            plan,
            tasks,
            suggestedOrder: order
        };
    }

    // ==================== Helper Methods ====================

    private getTaskIdsForPlan(planId: string): Set<string> {
        const plan = this.plans.get(planId);
        if (!plan) return new Set();

        const ids = new Set<string>();
        const queue = [...plan.rootTaskIds];

        while (queue.length > 0) {
            const taskId = queue.shift()!;
            ids.add(taskId);
            const task = this.tasks.get(taskId);
            if (task) {
                queue.push(...task.childIds);
            }
        }
        return ids;
    }

    private getTasksForPlan(planId: string): PlanTask[] {
        const ids = this.getTaskIdsForPlan(planId);
        return Array.from(ids).map(id => this.tasks.get(id)!).filter(Boolean);
    }

    private updateBlockedBy(task: PlanTask): void {
        task.blockedBy = task.dependencies
            .filter(d => d.type === 'blocks' || d.type === 'requires')
            .map(d => d.taskId)
            .filter(id => {
                const dep = this.tasks.get(id);
                return dep && dep.status !== 'completed';
            });
    }

    private recalculateBlockedTasks(): void {
        for (const task of this.tasks.values()) {
            this.updateBlockedBy(task);
        }
    }

    private updatePlanProgress(task: PlanTask): void {
        // Find the plan this task belongs to
        for (const plan of this.plans.values()) {
            const taskIds = this.getTaskIdsForPlan(plan.id);
            if (taskIds.has(task.id)) {
                plan.completedTasks = Array.from(taskIds)
                    .filter(id => this.tasks.get(id)?.status === 'completed').length;
                plan.totalTasks = taskIds.size;
                plan.progress = plan.totalTasks > 0
                    ? Math.round((plan.completedTasks / plan.totalTasks) * 100)
                    : 0;
                plan.updatedAt = Date.now();

                if (plan.progress === 100) {
                    plan.status = 'completed';
                    plan.completedAt = Date.now();
                }
                break;
            }
        }
    }

    private topologicalSort(tasks: PlanTask[]): string[] {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const visited = new Set<string>();
        const result: string[] = [];

        const visit = (id: string) => {
            if (visited.has(id)) return;
            visited.add(id);

            const task = taskMap.get(id);
            if (task) {
                for (const dep of task.dependencies) {
                    if (taskMap.has(dep.taskId)) {
                        visit(dep.taskId);
                    }
                }
                result.push(id);
            }
        };

        for (const task of tasks) {
            visit(task.id);
        }
        return result;
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            plans: Array.from(this.plans.entries()),
            tasks: Array.from(this.tasks.entries()),
            learnings: this.learnings
        };
        await this.context.globalState.update(Planner.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            plans: [string, Plan][];
            tasks: [string, PlanTask][];
            learnings: string[];
        }>(Planner.STORAGE_KEY);

        if (data) {
            this.plans = new Map(data.plans);
            this.tasks = new Map(data.tasks);
            this.learnings = data.learnings || [];
        }
    }

    clearAllData(): void {
        this.plans.clear();
        this.tasks.clear();
        this.learnings = [];
        this.saveState();
    }
}
