/**
 * Self-Evaluation Framework
 * Enables the agent to assess its own performance and plan improvements
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { MetricsCollector, PerformanceSnapshot } from '../metrics';
import { Planner, Plan } from '../planning';
import {
    EvaluationCriteria, SelfAssessment, ImprovementOpportunity,
    EvaluationGoal, EvaluationConfig, ImprovementCategory,
    DEFAULT_CRITERIA, EvaluationScope
} from './types';

export class SelfEvaluator {
    private criteria: Map<string, EvaluationCriteria> = new Map();
    private assessments: SelfAssessment[] = [];
    private opportunities: Map<string, ImprovementOpportunity> = new Map();
    private goals: Map<string, EvaluationGoal> = new Map();

    private static readonly STORAGE_KEY = 'vibey.evaluation.data';
    private static readonly DEFAULT_CONFIG: EvaluationConfig = {
        autoEvaluateInterval: 24,
        minDataPointsForEvaluation: 10,
        improvementThreshold: 5,
        focusAreas: ['capability', 'efficiency', 'quality']
    };

    constructor(
        private context: vscode.ExtensionContext,
        private metricsCollector: MetricsCollector,
        private planner: Planner,
        private config: EvaluationConfig = SelfEvaluator.DEFAULT_CONFIG
    ) {
        // Register default criteria
        for (const criterion of DEFAULT_CRITERIA) {
            this.criteria.set(criterion.id, criterion);
        }
        this.loadState();
    }

    // ==================== Assessment ====================

    async performAssessment(scope: EvaluationScope = 'overall'): Promise<SelfAssessment> {
        const snapshot = this.metricsCollector.createSnapshot();
        const previousAssessment = this.getLatestAssessment(scope);
        
        // Calculate criteria scores
        const criteriaScores = await this.evaluateCriteria(scope, snapshot);
        
        // Calculate overall score (weighted average)
        const totalWeight = criteriaScores.reduce((sum, cs) => {
            const criterion = this.criteria.get(cs.criterionId);
            return sum + (criterion?.weight || 1);
        }, 0);
        
        const overallScore = criteriaScores.reduce((sum, cs) => {
            const criterion = this.criteria.get(cs.criterionId);
            return sum + (cs.score * (criterion?.weight || 1));
        }, 0) / totalWeight;

        // Perform SWOT analysis
        const swot = this.performSWOT(snapshot, criteriaScores);
        
        // Generate improvement recommendations
        const recommendations = this.identifyImprovements(criteriaScores, swot);

        const assessment: SelfAssessment = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            scope,
            overallScore: Math.round(overallScore),
            criteriaScores,
            strengths: swot.strengths,
            weaknesses: swot.weaknesses,
            opportunities: swot.opportunities,
            threats: swot.threats,
            previousAssessmentId: previousAssessment?.id,
            improvementSinceLast: previousAssessment 
                ? overallScore - previousAssessment.overallScore 
                : undefined,
            recommendations
        };

        this.assessments.push(assessment);
        
        // Store improvement opportunities
        for (const opp of recommendations) {
            this.opportunities.set(opp.id, opp);
        }

        this.saveState();
        return assessment;
    }

    private async evaluateCriteria(
        scope: EvaluationScope, 
        snapshot: PerformanceSnapshot
    ): Promise<SelfAssessment['criteriaScores']> {
        const relevantCriteria = Array.from(this.criteria.values())
            .filter(c => scope === 'overall' || c.scope === scope);

        return relevantCriteria.map(criterion => {
            // Find matching metric from snapshot
            const metricSummary = snapshot.metrics.find(m => 
                m.metricId.includes(criterion.id) || 
                criterion.id.includes(m.metricId.split('_')[0])
            );

            let score = 50; // Default neutral score
            const evidence: string[] = [];

            if (metricSummary) {
                // Convert metric to score (0-100)
                if (metricSummary.currentValue !== undefined) {
                    // For rate metrics, multiply by 100
                    score = Math.min(100, Math.max(0, metricSummary.currentValue * 100));
                    evidence.push(`Current value: ${metricSummary.currentValue.toFixed(2)}`);
                    
                    if (metricSummary.trend !== 'stable') {
                        evidence.push(`Trend: ${metricSummary.trend} (${metricSummary.changePercent?.toFixed(1)}%)`);
                    }
                }
            } else {
                evidence.push('Insufficient data for accurate measurement');
            }

            return {
                criterionId: criterion.id,
                score,
                evidence
            };
        });
    }

    private performSWOT(
        snapshot: PerformanceSnapshot,
        criteriaScores: SelfAssessment['criteriaScores']
    ): { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] } {
        const strengths: string[] = [...snapshot.strengths];
        const weaknesses: string[] = [...snapshot.weaknesses];
        const opportunities: string[] = [];
        const threats: string[] = [];

        // Analyze criteria scores
        for (const cs of criteriaScores) {
            const criterion = this.criteria.get(cs.criterionId);
            if (!criterion) continue;

            if (cs.score >= 80) {
                strengths.push(`Strong ${criterion.name}`);
            } else if (cs.score < 50) {
                weaknesses.push(`Weak ${criterion.name}`);
                opportunities.push(`Improve ${criterion.name} through targeted practice`);
            }
        }

        // Check for declining metrics as threats
        for (const metric of snapshot.metrics) {
            if (metric.trend === 'down' && metric.changePercent && metric.changePercent < -10) {
                threats.push(`${metric.name} declining significantly`);
            }
        }

        return { strengths, weaknesses, opportunities, threats };
    }

    private identifyImprovements(
        criteriaScores: SelfAssessment['criteriaScores'],
        swot: ReturnType<typeof this.performSWOT>
    ): ImprovementOpportunity[] {
        const opportunities: ImprovementOpportunity[] = [];

        // Generate opportunities from weaknesses
        for (const weakness of swot.weaknesses) {
            const category = this.categorizeWeakness(weakness);
            opportunities.push({
                id: crypto.randomUUID(),
                category,
                title: `Address: ${weakness}`,
                description: `Identified weakness: ${weakness}`,
                impact: 'medium',
                effort: 'medium',
                priority: 5,
                status: 'identified',
                sourceAssessmentId: '',  // Will be set by caller
                relatedCriteria: [],
                suggestedActions: this.suggestActionsForWeakness(weakness, category),
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
        }

        // Prioritize opportunities (impact/effort matrix)
        for (const opp of opportunities) {
            const impactScore = opp.impact === 'high' ? 3 : opp.impact === 'medium' ? 2 : 1;
            const effortScore = opp.effort === 'high' ? 1 : opp.effort === 'medium' ? 2 : 3;
            opp.priority = impactScore * effortScore;
        }

        return opportunities.sort((a, b) => b.priority - a.priority);
    }

    private categorizeWeakness(weakness: string): ImprovementCategory {
        const lower = weakness.toLowerCase();
        if (lower.includes('error') || lower.includes('fail') || lower.includes('reliable')) {
            return 'reliability';
        }
        if (lower.includes('slow') || lower.includes('effic') || lower.includes('time')) {
            return 'efficiency';
        }
        if (lower.includes('quality') || lower.includes('code')) {
            return 'quality';
        }
        if (lower.includes('security') || lower.includes('safe')) {
            return 'security';
        }
        return 'capability';
    }

    private suggestActionsForWeakness(weakness: string, category: ImprovementCategory): string[] {
        const actions: string[] = [];

        switch (category) {
            case 'reliability':
                actions.push('Add better error handling');
                actions.push('Implement retry logic with backoff');
                actions.push('Add validation before operations');
                break;
            case 'efficiency':
                actions.push('Optimize frequently-used operations');
                actions.push('Reduce unnecessary LLM calls');
                actions.push('Cache repeated computations');
                break;
            case 'quality':
                actions.push('Add more thorough testing');
                actions.push('Implement code review checks');
                actions.push('Use linting and formatting tools');
                break;
            case 'security':
                actions.push('Audit permission checks');
                actions.push('Add input validation');
                actions.push('Review file access patterns');
                break;
            default:
                actions.push('Research best practices');
                actions.push('Study similar implementations');
                actions.push('Experiment with different approaches');
        }

        return actions;
    }

    // ==================== Goals ====================

    createGoal(
        name: string,
        description: string,
        category: ImprovementCategory,
        targetMetric: string,
        targetValue: number,
        deadline?: number
    ): EvaluationGoal {
        const currentValue = this.getCurrentMetricValue(targetMetric);

        const goal: EvaluationGoal = {
            id: crypto.randomUUID(),
            name,
            description,
            category,
            targetMetric,
            targetValue,
            currentValue,
            baselineValue: currentValue,
            deadline,
            createdAt: Date.now(),
            progress: 0,
            milestones: [],
            status: 'active'
        };

        this.goals.set(goal.id, goal);
        this.saveState();
        return goal;
    }

    updateGoalProgress(goalId: string): EvaluationGoal | undefined {
        const goal = this.goals.get(goalId);
        if (!goal) return undefined;

        goal.currentValue = this.getCurrentMetricValue(goal.targetMetric);

        // Calculate progress
        const range = goal.targetValue - goal.baselineValue;
        if (range !== 0) {
            goal.progress = Math.min(100, Math.max(0,
                ((goal.currentValue - goal.baselineValue) / range) * 100
            ));
        }

        // Check if goal is achieved
        if (goal.progress >= 100) {
            goal.status = 'achieved';
        } else if (goal.deadline && Date.now() > goal.deadline) {
            goal.status = 'missed';
        }

        this.saveState();
        return goal;
    }

    private getCurrentMetricValue(metricId: string): number {
        const summary = this.metricsCollector.getSummary(metricId);
        return summary?.currentValue ?? 0;
    }

    // ==================== Query Methods ====================

    getLatestAssessment(scope?: EvaluationScope): SelfAssessment | undefined {
        const filtered = scope
            ? this.assessments.filter(a => a.scope === scope)
            : this.assessments;
        return filtered[filtered.length - 1];
    }

    getTopOpportunities(limit: number = 5): ImprovementOpportunity[] {
        return Array.from(this.opportunities.values())
            .filter(o => o.status === 'identified' || o.status === 'planned')
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
    }

    getActiveGoals(): EvaluationGoal[] {
        return Array.from(this.goals.values())
            .filter(g => g.status === 'active');
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            assessments: this.assessments,
            opportunities: Array.from(this.opportunities.entries()),
            goals: Array.from(this.goals.entries())
        };
        await this.context.globalState.update(SelfEvaluator.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            assessments: SelfAssessment[];
            opportunities: [string, ImprovementOpportunity][];
            goals: [string, EvaluationGoal][];
        }>(SelfEvaluator.STORAGE_KEY);

        if (data) {
            this.assessments = data.assessments || [];
            this.opportunities = new Map(data.opportunities || []);
            this.goals = new Map(data.goals || []);
        }
    }

    clearAllData(): void {
        this.assessments = [];
        this.opportunities.clear();
        this.goals.clear();
        this.saveState();
    }
}
