/**
 * Feedback Loop System
 * Learns from actions, detects patterns, and adapts behavior
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
    FeedbackEntry, Adaptation, Pattern, FeedbackContext,
    FeedbackConfig, FeedbackSource, FeedbackSentiment,
    AdaptationType, DEFAULT_FEEDBACK_CONFIG
} from './types';

export class FeedbackLoop {
    private feedback: FeedbackEntry[] = [];
    private adaptations: Map<string, Adaptation> = new Map();
    private patterns: Map<string, Pattern> = new Map();

    private static readonly STORAGE_KEY = 'vibey.feedback.data';

    constructor(
        private context: vscode.ExtensionContext,
        private config: FeedbackConfig = DEFAULT_FEEDBACK_CONFIG
    ) {
        this.loadState();
    }

    // ==================== Recording Feedback ====================

    recordFeedback(
        source: FeedbackSource,
        action: string,
        outcome: string,
        sentiment: FeedbackSentiment,
        options: {
            tool?: string;
            context?: string;
            expectedOutcome?: string;
            lessons?: string[];
        } = {}
    ): FeedbackEntry {
        const deviation = sentiment === 'positive' ? 0.5 
            : sentiment === 'negative' ? -0.5 
            : 0;

        const entry: FeedbackEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            source,
            sentiment,
            action,
            tool: options.tool,
            context: options.context || '',
            outcome,
            expectedOutcome: options.expectedOutcome,
            deviation,
            lessonsExtracted: options.lessons || []
        };

        this.feedback.push(entry);
        
        // Auto-learn if enabled
        if (this.config.enableAutoLearning) {
            this.processForLearning(entry);
        }

        this.pruneOldFeedback();
        this.saveState();
        return entry;
    }

    recordToolResult(
        tool: string,
        success: boolean,
        context: string,
        details?: string
    ): void {
        this.recordFeedback(
            'tool_result',
            `Execute ${tool}`,
            success ? 'Success' : `Failed: ${details}`,
            success ? 'positive' : 'negative',
            { tool, context }
        );
    }

    recordUserFeedback(
        action: string,
        sentiment: FeedbackSentiment,
        feedback: string
    ): void {
        const entry = this.recordFeedback(
            'user_explicit',
            action,
            feedback,
            sentiment,
            { context: 'User provided explicit feedback' }
        );

        // User feedback has high weight for learning
        if (sentiment === 'negative') {
            this.createAdaptation(
                'avoidance',
                `Avoid: ${action}`,
                `User indicated negative experience with ${action}`,
                [action],
                { type: 'avoid', target: action }
            );
        }
    }

    // ==================== Learning & Adaptation ====================

    private processForLearning(entry: FeedbackEntry): void {
        // Detect patterns
        this.detectPatterns(entry);

        // Extract lessons
        if (entry.sentiment === 'negative' && entry.tool) {
            const lesson = `Tool ${entry.tool} failed in context: ${entry.context}`;
            entry.lessonsExtracted.push(lesson);
        }

        // Check if pattern threshold met for adaptation
        const relevantPatterns = this.findRelevantPatterns(entry);
        for (const pattern of relevantPatterns) {
            if (pattern.occurrences >= this.config.patternDetectionThreshold) {
                this.createAdaptationFromPattern(pattern);
            }
        }
    }

    private detectPatterns(entry: FeedbackEntry): void {
        // Pattern key based on action and sentiment
        const key = `${entry.action}:${entry.sentiment}`;
        
        let pattern = this.patterns.get(key);
        if (!pattern) {
            pattern = {
                id: crypto.randomUUID(),
                name: `Pattern: ${entry.action}`,
                description: `Recurring ${entry.sentiment} outcomes for ${entry.action}`,
                indicators: [entry.action],
                frequency: 0,
                category: entry.sentiment === 'negative' ? 'failure' : 'success',
                severity: 'medium',
                suggestedActions: [],
                relatedAdaptations: [],
                firstDetectedAt: Date.now(),
                lastDetectedAt: Date.now(),
                occurrences: 0
            };
            this.patterns.set(key, pattern);
        }

        pattern.occurrences++;
        pattern.lastDetectedAt = Date.now();
        
        // Update frequency (occurrences per day)
        const days = (Date.now() - pattern.firstDetectedAt) / (24 * 60 * 60 * 1000);
        pattern.frequency = pattern.occurrences / Math.max(1, days);
    }

    private findRelevantPatterns(entry: FeedbackEntry): Pattern[] {
        return Array.from(this.patterns.values()).filter(p => 
            p.indicators.some(i => entry.action.includes(i) || entry.context.includes(i))
        );
    }

    private createAdaptationFromPattern(pattern: Pattern): void {
        if (pattern.category !== 'failure') return;

        const existingAdaptation = Array.from(this.adaptations.values())
            .find(a => a.triggerPatterns.some(t => pattern.indicators.includes(t)));
        
        if (existingAdaptation) return;

        this.createAdaptation(
            'avoidance',
            `Learned: Avoid ${pattern.name}`,
            `Pattern detected: ${pattern.description}`,
            pattern.indicators,
            { type: 'avoid', target: pattern.indicators[0] }
        );
    }

    createAdaptation(
        type: AdaptationType,
        name: string,
        description: string,
        triggerPatterns: string[],
        modification: Adaptation['modification']
    ): Adaptation {
        const adaptation: Adaptation = {
            id: crypto.randomUUID(),
            type,
            name,
            description,
            triggerPatterns,
            modification,
            timesApplied: 0,
            successCount: 0,
            successRate: 0,
            confidence: 0.5,  // Start with medium confidence
            createdAt: Date.now(),
            source: 'feedback_loop',
            active: true
        };

        this.adaptations.set(adaptation.id, adaptation);
        this.saveState();
        return adaptation;
    }

    // ==================== Applying Adaptations ====================

    getApplicableAdaptations(action: string, context: string): Adaptation[] {
        return Array.from(this.adaptations.values())
            .filter(a => a.active && a.confidence >= this.config.minConfidenceForAdaptation)
            .filter(a => a.triggerPatterns.some(p =>
                action.includes(p) || context.includes(p)
            ))
            .sort((a, b) => b.confidence - a.confidence);
    }

    applyAdaptation(adaptationId: string, successful: boolean): void {
        const adaptation = this.adaptations.get(adaptationId);
        if (!adaptation) return;

        adaptation.timesApplied++;
        adaptation.lastAppliedAt = Date.now();

        if (successful) {
            adaptation.successCount++;
        }

        adaptation.successRate = adaptation.successCount / adaptation.timesApplied;

        // Update confidence based on success rate
        adaptation.confidence = Math.min(1, Math.max(0,
            0.5 + (adaptation.successRate - 0.5) * Math.min(1, adaptation.timesApplied / 10)
        ));

        // Deactivate consistently failing adaptations
        if (adaptation.timesApplied >= 5 && adaptation.successRate < 0.3) {
            adaptation.active = false;
        }

        this.saveState();
    }

    // ==================== Query Methods ====================

    getContext(): FeedbackContext {
        const recentFeedback = this.feedback
            .slice(-50)
            .sort((a, b) => b.timestamp - a.timestamp);

        const sentimentSum = recentFeedback.reduce((sum, f) => {
            return sum + (f.sentiment === 'positive' ? 1 : f.sentiment === 'negative' ? -1 : 0);
        }, 0);

        const totalLessons = this.feedback.reduce((sum, f) => sum + f.lessonsExtracted.length, 0);
        const appliedLessons = Array.from(this.adaptations.values())
            .reduce((sum, a) => sum + a.timesApplied, 0);
        const effectiveLessons = Array.from(this.adaptations.values())
            .reduce((sum, a) => sum + a.successCount, 0);

        return {
            recentFeedback,
            activeAdaptations: Array.from(this.adaptations.values()).filter(a => a.active),
            detectedPatterns: Array.from(this.patterns.values()),
            overallSentiment: recentFeedback.length > 0 ? sentimentSum / recentFeedback.length : 0,
            learningProgress: {
                totalLessons,
                appliedLessons,
                effectiveLessons
            }
        };
    }

    getActiveAdaptations(): Adaptation[] {
        return Array.from(this.adaptations.values())
            .filter(a => a.active)
            .sort((a, b) => b.confidence - a.confidence);
    }

    getPatterns(category?: Pattern['category']): Pattern[] {
        let patterns = Array.from(this.patterns.values());
        if (category) {
            patterns = patterns.filter(p => p.category === category);
        }
        return patterns.sort((a, b) => b.occurrences - a.occurrences);
    }

    // ==================== Helpers ====================

    private pruneOldFeedback(): void {
        const cutoff = Date.now() - (this.config.feedbackRetentionDays * 24 * 60 * 60 * 1000);
        this.feedback = this.feedback.filter(f => f.timestamp >= cutoff);
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            feedback: this.feedback.slice(-500),  // Keep last 500
            adaptations: Array.from(this.adaptations.entries()),
            patterns: Array.from(this.patterns.entries())
        };
        await this.context.globalState.update(FeedbackLoop.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            feedback: FeedbackEntry[];
            adaptations: [string, Adaptation][];
            patterns: [string, Pattern][];
        }>(FeedbackLoop.STORAGE_KEY);

        if (data) {
            this.feedback = data.feedback || [];
            this.adaptations = new Map(data.adaptations || []);
            this.patterns = new Map(data.patterns || []);
        }
    }

    clearAllData(): void {
        this.feedback = [];
        this.adaptations.clear();
        this.patterns.clear();
        this.saveState();
    }
}
