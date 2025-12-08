/**
 * Feedback Loop System Types
 * Enables learning from actions and adapting behavior over time
 */

export type FeedbackSource = 'tool_result' | 'user_explicit' | 'user_implicit' | 'self_evaluation' | 'metric';
export type FeedbackSentiment = 'positive' | 'negative' | 'neutral';
export type AdaptationType = 'preference' | 'strategy' | 'avoidance' | 'enhancement';

export interface FeedbackEntry {
    id: string;
    timestamp: number;
    source: FeedbackSource;
    sentiment: FeedbackSentiment;
    
    // Context
    action: string;                 // What action was taken
    tool?: string;                  // Tool used, if applicable
    context: string;                // Situation context
    
    // Feedback details
    outcome: string;                // What happened
    expectedOutcome?: string;       // What was expected
    deviation?: number;             // -1 to 1, how far from expected
    
    // Learning
    lessonsExtracted: string[];
    appliedAdaptations?: string[];
}

export interface Adaptation {
    id: string;
    type: AdaptationType;
    name: string;
    description: string;
    
    // Trigger conditions
    triggerPatterns: string[];      // Patterns that activate this adaptation
    triggerContext?: string;
    
    // Behavioral change
    modification: {
        type: 'prefer' | 'avoid' | 'modify' | 'replace';
        target: string;             // Tool, approach, or pattern
        alternative?: string;       // Replacement if type is 'replace'
        parameters?: Record<string, unknown>;
    };
    
    // Effectiveness tracking
    timesApplied: number;
    successCount: number;
    successRate: number;
    confidence: number;             // 0-1, how confident in this adaptation
    
    // Lifecycle
    createdAt: number;
    lastAppliedAt?: number;
    source: string;                 // What feedback led to this
    active: boolean;
}

export interface Pattern {
    id: string;
    name: string;
    description: string;
    
    // Detection
    indicators: string[];           // Signs that this pattern is occurring
    frequency: number;              // How often detected
    
    // Classification
    category: 'success' | 'failure' | 'inefficiency' | 'risk';
    severity: 'low' | 'medium' | 'high';
    
    // Response
    suggestedActions: string[];
    relatedAdaptations: string[];
    
    // Tracking
    firstDetectedAt: number;
    lastDetectedAt: number;
    occurrences: number;
}

export interface FeedbackContext {
    recentFeedback: FeedbackEntry[];
    activeAdaptations: Adaptation[];
    detectedPatterns: Pattern[];
    overallSentiment: number;       // -1 to 1
    learningProgress: {
        totalLessons: number;
        appliedLessons: number;
        effectiveLessons: number;
    };
}

export interface FeedbackConfig {
    enableAutoLearning: boolean;
    minConfidenceForAdaptation: number;
    feedbackRetentionDays: number;
    patternDetectionThreshold: number;  // Occurrences needed to detect pattern
}

export const DEFAULT_FEEDBACK_CONFIG: FeedbackConfig = {
    enableAutoLearning: true,
    minConfidenceForAdaptation: 0.7,
    feedbackRetentionDays: 30,
    patternDetectionThreshold: 3
};

