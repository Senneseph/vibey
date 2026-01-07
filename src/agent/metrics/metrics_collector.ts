/**
 * Metrics Collector
 * Collects, stores, and analyzes agent performance metrics
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import {
    MetricDefinition, MetricDataPoint, MetricSummary,
    PerformanceSnapshot, DecisionRecord, LearningEntry,
    MetricsConfig, BUILTIN_METRICS, MetricCategory
} from './types';

export class MetricsCollector {
    private dataPoints: MetricDataPoint[] = [];
    private decisions: DecisionRecord[] = [];
    private learnings: LearningEntry[] = [];
    private metrics: Map<string, MetricDefinition> = new Map();
    private snapshots: PerformanceSnapshot[] = [];

    private static readonly STORAGE_KEY = 'vibey.metrics.data';
    private static readonly DEFAULT_CONFIG: MetricsConfig = {
        retentionDays: 30,
        snapshotInterval: 24,
        enableDetailedLogging: true
    };

    constructor(
        private context: vscode.ExtensionContext,
        private config: MetricsConfig = MetricsCollector.DEFAULT_CONFIG
    ) {
        // Register built-in metrics
        for (const metric of BUILTIN_METRICS) {
            this.metrics.set(metric.id, metric);
        }
        this.loadState();
    }

    // ==================== Recording ====================

    record(metricId: string, value: number, context?: Record<string, unknown>, tags?: string[]): void {
        const metric = this.metrics.get(metricId);
        if (!metric) {
            console.warn(`Unknown metric: ${metricId}`);
            return;
        }

        this.dataPoints.push({
            metricId,
            value,
            timestamp: Date.now(),
            context,
            tags
        });

        this.pruneOldData();
        this.saveState();
    }

    recordDecision(decision: Omit<DecisionRecord, 'id' | 'timestamp'>): string {
        const record: DecisionRecord = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            ...decision
        };
        this.decisions.push(record);
        this.saveState();
        return record.id;
    }

    updateDecisionOutcome(
        decisionId: string, 
        outcome: DecisionRecord['outcome']
    ): void {
        const decision = this.decisions.find(d => d.id === decisionId);
        if (decision) {
            decision.outcome = outcome;
            this.saveState();
        }
    }

    addLearning(entry: Omit<LearningEntry, 'id' | 'timestamp' | 'appliedCount'>): string {
        const learning: LearningEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            appliedCount: 0,
            ...entry
        };
        this.learnings.push(learning);
        this.saveState();
        return learning.id;
    }

    recordLearningApplied(learningId: string, success: boolean): void {
        const learning = this.learnings.find(l => l.id === learningId);
        if (learning) {
            learning.appliedCount++;
            // Update success rate
            const prevRate = learning.successRate ?? 0;
            const prevCount = learning.appliedCount - 1;
            learning.successRate = prevCount > 0
                ? (prevRate * prevCount + (success ? 1 : 0)) / learning.appliedCount
                : (success ? 1 : 0);
            this.saveState();
        }
    }

    // ==================== Analysis ====================

    getSummary(metricId: string, periodHours: number = 24): MetricSummary | undefined {
        const metric = this.metrics.get(metricId);
        if (!metric) return undefined;

        const now = Date.now();
        const periodStart = now - (periodHours * 60 * 60 * 1000);
        const prevPeriodStart = periodStart - (periodHours * 60 * 60 * 1000);

        const currentPoints = this.dataPoints.filter(
            p => p.metricId === metricId && p.timestamp >= periodStart
        );
        const prevPoints = this.dataPoints.filter(
            p => p.metricId === metricId && p.timestamp >= prevPeriodStart && p.timestamp < periodStart
        );

        const currentValue = this.aggregate(currentPoints, metric.aggregation);
        const previousValue = prevPoints.length > 0 
            ? this.aggregate(prevPoints, metric.aggregation) 
            : undefined;

        let trend: 'up' | 'down' | 'stable' = 'stable';
        let change: number | undefined;
        let changePercent: number | undefined;

        if (previousValue !== undefined && previousValue !== 0) {
            change = currentValue - previousValue;
            changePercent = (change / previousValue) * 100;
            const threshold = 5; // 5% change threshold
            if (Math.abs(changePercent) > threshold) {
                trend = change > 0 ? 'up' : 'down';
            }
        }

        return {
            metricId,
            name: metric.name,
            category: metric.category,
            currentValue,
            previousValue,
            change,
            changePercent,
            trend,
            dataPoints: currentPoints.length,
            period: { start: periodStart, end: now }
        };
    }

    getAllSummaries(periodHours: number = 24): MetricSummary[] {
        return Array.from(this.metrics.keys())
            .map(id => this.getSummary(id, periodHours))
            .filter((s): s is MetricSummary => s !== undefined);
    }

    createSnapshot(): PerformanceSnapshot {
        const summaries = this.getAllSummaries();
        const strengths: string[] = [];
        const weaknesses: string[] = [];
        const recommendations: string[] = [];

        // Analyze each metric
        for (const summary of summaries) {
            const metric = this.metrics.get(summary.metricId)!;
            const improving = (summary.trend === 'up' && metric.higherIsBetter) ||
                              (summary.trend === 'down' && !metric.higherIsBetter);
            const declining = (summary.trend === 'down' && metric.higherIsBetter) ||
                              (summary.trend === 'up' && !metric.higherIsBetter);

            if (improving) {
                strengths.push(`${metric.name} is improving (${summary.changePercent?.toFixed(1)}%)`);
            } else if (declining) {
                weaknesses.push(`${metric.name} is declining (${summary.changePercent?.toFixed(1)}%)`);
                recommendations.push(`Investigate ${metric.name} decline and identify root cause`);
            }
        }

        // Calculate overall score (simple weighted average for now)
        const scorableMetrics = summaries.filter(s => s.dataPoints > 0);
        const overallScore = scorableMetrics.length > 0
            ? scorableMetrics.reduce((sum, s) => {
                const metric = this.metrics.get(s.metricId)!;
                // Normalize to 0-100 based on typical ranges
                let normalized = s.currentValue;
                if (metric.aggregation === 'rate') {
                    normalized = s.currentValue * 100;
                }
                return sum + Math.min(100, Math.max(0, normalized));
            }, 0) / scorableMetrics.length
            : 50;

        const snapshot: PerformanceSnapshot = {
            timestamp: Date.now(),
            metrics: summaries,
            overallScore: Math.round(overallScore),
            strengths,
            weaknesses,
            recommendations
        };

        this.snapshots.push(snapshot);
        this.saveState();
        return snapshot;
    }

    getLatestSnapshot(): PerformanceSnapshot | undefined {
        return this.snapshots[this.snapshots.length - 1];
    }

    getLearnings(category?: LearningEntry['category']): LearningEntry[] {
        let entries = [...this.learnings];
        if (category) {
            entries = entries.filter(l => l.category === category);
        }
        return entries.sort((a, b) => b.confidence - a.confidence);
    }

    getRecentDecisions(limit: number = 20): DecisionRecord[] {
        return this.decisions
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    // ==================== Helpers ====================

    private aggregate(points: MetricDataPoint[], type: string): number {
        if (points.length === 0) return 0;
        const values = points.map(p => p.value);

        switch (type) {
            case 'sum':
                return values.reduce((a, b) => a + b, 0);
            case 'avg':
                return values.reduce((a, b) => a + b, 0) / values.length;
            case 'min':
                return Math.min(...values);
            case 'max':
                return Math.max(...values);
            case 'count':
                return values.length;
            case 'rate':
                const successes = values.filter(v => v === 1).length;
                return successes / values.length;
            default:
                return values[values.length - 1];
        }
    }

    private pruneOldData(): void {
        const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
        this.dataPoints = this.dataPoints.filter(p => p.timestamp >= cutoff);
        this.decisions = this.decisions.filter(d => d.timestamp >= cutoff);
        this.snapshots = this.snapshots.filter(s => s.timestamp >= cutoff);
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            dataPoints: this.dataPoints,
            decisions: this.decisions,
            learnings: this.learnings,
            snapshots: this.snapshots
        };
        await this.context.globalState.update(MetricsCollector.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            dataPoints: MetricDataPoint[];
            decisions: DecisionRecord[];
            learnings: LearningEntry[];
            snapshots: PerformanceSnapshot[];
        }>(MetricsCollector.STORAGE_KEY);

        if (data) {
            this.dataPoints = data.dataPoints || [];
            this.decisions = data.decisions || [];
            this.learnings = data.learnings || [];
            this.snapshots = data.snapshots || [];
        }
    }

    clearAllData(): void {
        this.dataPoints = [];
        this.decisions = [];
        this.learnings = [];
        this.snapshots = [];
        this.saveState();
    }

    /**
     * Reset token-related metrics to start fresh tracking
     */
    resetTokenMetrics(): void {
        // Remove all token-related data points
        this.dataPoints = this.dataPoints.filter(
            p => p.metricId !== 'tokens_sent' && p.metricId !== 'tokens_received'
        );
        this.saveState();
    }
}
