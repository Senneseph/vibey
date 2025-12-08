/**
 * Metrics & Performance Tracking Types
 * Tracks agent performance, decisions, and outcomes for self-improvement
 */

export type MetricCategory = 'performance' | 'quality' | 'efficiency' | 'learning' | 'security';
export type AggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'rate';

export interface MetricDefinition {
    id: string;
    name: string;
    description: string;
    category: MetricCategory;
    unit?: string;
    aggregation: AggregationType;
    higherIsBetter: boolean;
}

export interface MetricDataPoint {
    metricId: string;
    value: number;
    timestamp: number;
    context?: Record<string, unknown>;
    tags?: string[];
}

export interface MetricSummary {
    metricId: string;
    name: string;
    category: MetricCategory;
    currentValue: number;
    previousValue?: number;
    change?: number;
    changePercent?: number;
    trend: 'up' | 'down' | 'stable';
    dataPoints: number;
    period: { start: number; end: number };
}

export interface PerformanceSnapshot {
    timestamp: number;
    metrics: MetricSummary[];
    overallScore: number;           // 0-100 composite score
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
}

export interface DecisionRecord {
    id: string;
    timestamp: number;
    type: 'tool_selection' | 'plan_creation' | 'task_execution' | 'error_recovery' | 'user_interaction';
    context: string;
    options: string[];
    chosen: string;
    reasoning?: string;
    outcome?: {
        success: boolean;
        impact?: number;            // -1 to 1 scale
        feedback?: string;
    };
}

export interface LearningEntry {
    id: string;
    timestamp: number;
    category: 'success' | 'failure' | 'insight' | 'pattern';
    source: string;                 // What triggered this learning
    lesson: string;
    confidence: number;             // 0-1 how confident in this learning
    appliedCount: number;           // How many times this learning was used
    successRate?: number;           // When applied, how often it helped
}

export interface MetricsConfig {
    retentionDays: number;
    snapshotInterval: number;       // hours
    enableDetailedLogging: boolean;
}

// Built-in metric definitions
export const BUILTIN_METRICS: MetricDefinition[] = [
    {
        id: 'tool_success_rate',
        name: 'Tool Success Rate',
        description: 'Percentage of tool executions that succeed',
        category: 'performance',
        unit: '%',
        aggregation: 'rate',
        higherIsBetter: true
    },
    {
        id: 'task_completion_rate',
        name: 'Task Completion Rate',
        description: 'Percentage of tasks completed successfully',
        category: 'performance',
        unit: '%',
        aggregation: 'rate',
        higherIsBetter: true
    },
    {
        id: 'avg_task_duration',
        name: 'Average Task Duration',
        description: 'Average time to complete a task',
        category: 'efficiency',
        unit: 'minutes',
        aggregation: 'avg',
        higherIsBetter: false
    },
    {
        id: 'turns_per_task',
        name: 'Turns Per Task',
        description: 'Average LLM turns needed to complete a task',
        category: 'efficiency',
        aggregation: 'avg',
        higherIsBetter: false
    },
    {
        id: 'error_recovery_rate',
        name: 'Error Recovery Rate',
        description: 'Percentage of errors successfully recovered from',
        category: 'quality',
        unit: '%',
        aggregation: 'rate',
        higherIsBetter: true
    },
    {
        id: 'security_violations',
        name: 'Security Violations',
        description: 'Number of blocked security violations',
        category: 'security',
        aggregation: 'count',
        higherIsBetter: false
    },
    {
        id: 'learnings_applied',
        name: 'Learnings Applied',
        description: 'Number of past learnings successfully applied',
        category: 'learning',
        aggregation: 'count',
        higherIsBetter: true
    }
];

