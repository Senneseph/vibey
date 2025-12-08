/**
 * Self-Evaluation Framework Types
 * Enables the agent to assess its own performance and identify improvement areas
 */

export type EvaluationScope = 'overall' | 'task' | 'tool' | 'interaction' | 'codebase';
export type ImprovementCategory = 'capability' | 'efficiency' | 'quality' | 'reliability' | 'security';
export type ImprovementStatus = 'identified' | 'planned' | 'in_progress' | 'testing' | 'completed' | 'deferred';

export interface EvaluationCriteria {
    id: string;
    name: string;
    description: string;
    scope: EvaluationScope;
    weight: number;                 // 0-1, importance weight
    targetValue?: number;
    currentValue?: number;
    measurementMethod: string;      // How to measure this criterion
}

export interface SelfAssessment {
    id: string;
    timestamp: number;
    scope: EvaluationScope;
    
    // Scores
    overallScore: number;           // 0-100
    criteriaScores: {
        criterionId: string;
        score: number;
        evidence: string[];
    }[];
    
    // Analysis
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];              // SWOT analysis
    
    // Comparisons
    previousAssessmentId?: string;
    improvementSinceLast?: number;  // Percentage change
    
    // Recommendations
    recommendations: ImprovementOpportunity[];
}

export interface ImprovementOpportunity {
    id: string;
    category: ImprovementCategory;
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
    priority: number;               // Computed from impact/effort
    status: ImprovementStatus;
    
    // Evidence
    sourceAssessmentId: string;
    relatedCriteria: string[];
    
    // Implementation
    suggestedActions: string[];
    requiredTools?: string[];
    estimatedBenefit?: string;
    
    // Tracking
    createdAt: number;
    updatedAt: number;
    completedAt?: number;
    outcome?: {
        success: boolean;
        actualBenefit: string;
        lessonsLearned: string[];
    };
}

export interface EvaluationGoal {
    id: string;
    name: string;
    description: string;
    category: ImprovementCategory;
    
    // Target
    targetMetric: string;
    targetValue: number;
    currentValue: number;
    baselineValue: number;
    
    // Timeline
    deadline?: number;
    createdAt: number;
    
    // Progress
    progress: number;               // 0-100 percentage toward goal
    milestones: {
        value: number;
        reachedAt?: number;
        description: string;
    }[];
    
    // Status
    status: 'active' | 'achieved' | 'missed' | 'paused';
}

export interface EvaluationConfig {
    autoEvaluateInterval: number;   // hours between auto-evaluations
    minDataPointsForEvaluation: number;
    improvementThreshold: number;   // minimum % improvement to consider significant
    focusAreas: ImprovementCategory[];
}

// Default evaluation criteria
export const DEFAULT_CRITERIA: EvaluationCriteria[] = [
    {
        id: 'task_success',
        name: 'Task Success Rate',
        description: 'Percentage of assigned tasks completed successfully',
        scope: 'task',
        weight: 1.0,
        measurementMethod: 'Track completed vs failed tasks'
    },
    {
        id: 'tool_effectiveness',
        name: 'Tool Effectiveness',
        description: 'How well tools are selected and used for tasks',
        scope: 'tool',
        weight: 0.8,
        measurementMethod: 'Track tool success rate and appropriateness'
    },
    {
        id: 'response_quality',
        name: 'Response Quality',
        description: 'Quality and helpfulness of responses to users',
        scope: 'interaction',
        weight: 0.9,
        measurementMethod: 'Track user feedback and task outcomes'
    },
    {
        id: 'efficiency',
        name: 'Execution Efficiency',
        description: 'How efficiently tasks are completed (time, resources)',
        scope: 'overall',
        weight: 0.7,
        measurementMethod: 'Track turns per task, time to completion'
    },
    {
        id: 'error_handling',
        name: 'Error Handling',
        description: 'Ability to recover from errors gracefully',
        scope: 'overall',
        weight: 0.8,
        measurementMethod: 'Track error recovery rate'
    },
    {
        id: 'code_quality',
        name: 'Code Quality',
        description: 'Quality of code produced or modified',
        scope: 'codebase',
        weight: 0.9,
        measurementMethod: 'Track lint errors, test results, code review feedback'
    }
];

