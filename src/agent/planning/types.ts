/**
 * Advanced Planning System Types
 * Supports hierarchical tasks, dependencies, priorities, and self-improvement workflows
 */

export type PlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskType = 'goal' | 'milestone' | 'task' | 'subtask' | 'action';

export interface TaskDependency {
    taskId: string;
    type: 'blocks' | 'requires' | 'suggests';  // blocks = hard dependency, requires = soft, suggests = optional
}

export interface TaskMetrics {
    estimatedDuration?: number;     // in minutes
    actualDuration?: number;
    attempts: number;
    successRate?: number;           // 0-1 for recurring tasks
    lastAttemptAt?: number;
    completedAt?: number;
}

export interface TaskOutcome {
    success: boolean;
    result?: unknown;
    error?: string;
    metrics?: Record<string, number>;
    learnings?: string[];           // What was learned from this task
}

export interface PlanTask {
    id: string;
    type: TaskType;
    title: string;
    description: string;
    status: PlanStatus;
    priority: TaskPriority;
    
    // Hierarchy
    parentId?: string;
    childIds: string[];
    
    // Dependencies
    dependencies: TaskDependency[];
    blockedBy: string[];            // Computed: tasks blocking this one
    
    // Execution
    assignedTo?: 'agent' | 'user';
    toolsRequired?: string[];
    parameters?: Record<string, unknown>;
    
    // Metrics & Learning
    metrics: TaskMetrics;
    outcome?: TaskOutcome;
    
    // Metadata
    tags: string[];
    createdAt: number;
    updatedAt: number;
    dueDate?: number;
}

export interface Plan {
    id: string;
    name: string;
    description: string;
    status: PlanStatus;
    
    // Goals
    primaryGoal: string;
    successCriteria: string[];
    
    // Tasks (root task IDs - the tree structure)
    rootTaskIds: string[];
    
    // Metrics
    totalTasks: number;
    completedTasks: number;
    progress: number;               // 0-100
    
    // Self-improvement specific
    category?: 'feature' | 'bugfix' | 'refactor' | 'optimization' | 'security' | 'learning';
    impactEstimate?: 'high' | 'medium' | 'low';
    riskLevel?: 'high' | 'medium' | 'low';
    
    // Timestamps
    createdAt: number;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
}

export interface PlanningContext {
    currentPlan?: Plan;
    activeTasks: PlanTask[];
    blockedTasks: PlanTask[];
    completedToday: PlanTask[];
    learnings: string[];            // Accumulated learnings from completed tasks
}

export interface PlanCreateOptions {
    name: string;
    description: string;
    primaryGoal: string;
    successCriteria?: string[];
    category?: Plan['category'];
    priority?: TaskPriority;
}

export interface TaskCreateOptions {
    type?: TaskType;
    title: string;
    description: string;
    parentId?: string;
    priority?: TaskPriority;
    dependencies?: TaskDependency[];
    toolsRequired?: string[];
    estimatedDuration?: number;
    tags?: string[];
}

export interface PlanDecomposition {
    plan: Plan;
    tasks: PlanTask[];
    suggestedOrder: string[];       // Task IDs in suggested execution order
}

