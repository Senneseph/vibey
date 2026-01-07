import * as vscode from 'vscode';

export interface TokenLimits {
    warningThreshold: number;  // When to start being careful (80% of max)
    maxTokens: number;         // Hard limit for this context window
    requestTimeout: number;    // How long to wait for Ollama response (ms)
}

export interface TokenUsage {
    systemPrompt: number;
    context: number;
    userMessage: number;
    toolResults: number;
    total: number;
}

export class TokenManager {
    private limits: TokenLimits;

    constructor() {
        this.limits = this.loadLimits();
        console.log(`[VIBEY][TokenManager] Initialized with limits:`, this.limits);
    }

    private loadLimits(): TokenLimits {
        const config = vscode.workspace.getConfiguration('vibey');
        const maxTokens = config.get<number>('maxContextTokens') || 32768;
        const requestTimeout = config.get<number>('ollamaRequestTimeout') || 300000; // 5 minutes default
        
        return {
            maxTokens,
            warningThreshold: Math.floor(maxTokens * 0.8),
            requestTimeout
        };
    }

    /**
     * Get token count from the LLM server for accurate tracking
     */
    async getTokenCountFromLLM(text: string): Promise<number> {
        // This method should be implemented to call the LLM server and retrieve the token count
        // For now, we'll return a placeholder value
        console.log(`[VIBEY][TokenManager] Retrieving token count from LLM server for text of length ${text.length}`);
        return Math.ceil(text.length / 4); // Placeholder until LLM integration is complete
    }

    /**
     * Update token usage based on LLM server response
     */
    async updateTokenUsageFromLLMResponse(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): Promise<void> {
        console.log(`[VIBEY][TokenManager] Updating token usage from LLM response:`, usage);
        // This method will be used to update the token usage based on the LLM server response
    }

    /**
     * Calculate token usage breakdown using LLM server token counts
     */
    async calculateUsage(systemPrompt: string, context: string, userMessage: string, toolResults: string = ''): Promise<TokenUsage> {
        const [systemPromptTokens, contextTokens, userMessageTokens, toolResultsTokens] = await Promise.all([
            this.getTokenCountFromLLM(systemPrompt),
            this.getTokenCountFromLLM(context),
            this.getTokenCountFromLLM(userMessage),
            this.getTokenCountFromLLM(toolResults)
        ]);
        
        return {
            systemPrompt: systemPromptTokens,
            context: contextTokens,
            userMessage: userMessageTokens,
            toolResults: toolResultsTokens,
            total: systemPromptTokens + contextTokens + userMessageTokens + toolResultsTokens
        };
    }

    /**
     * Check if we're approaching the token limit
     */
    isApproachingLimit(currentTokens: number): boolean {
        return currentTokens > this.limits.warningThreshold;
    }

    /**
     * Check if we've exceeded the token limit
     */
    isExceeded(currentTokens: number): boolean {
        return currentTokens > this.limits.maxTokens;
    }

    /**
     * Get how many tokens we have left
     */
    getRemainingTokens(currentTokens: number): number {
        return Math.max(0, this.limits.maxTokens - currentTokens);
    }

    /**
     * Get percentage of limit used
     */
    getUsagePercentage(currentTokens: number): number {
        return Math.round((currentTokens / this.limits.maxTokens) * 100);
    }

    /**
     * Calculate safe context size for a message
     * Reserve tokens for system prompt, user message, and response
     */
    calculateMaxContextSize(systemPromptTokens: number, userMessageTokens: number, responseReserve: number = 2000): number {
        const reservedForResponse = responseReserve;
        const available = this.limits.maxTokens - systemPromptTokens - userMessageTokens - reservedForResponse;
        return Math.max(0, available * 4); // Convert back to approximate characters
    }

    /**
     * Truncate context to fit within limits, keeping most recent items
     */
    async truncateContext(fullContext: string, systemPromptTokens: number, userMessageTokens: number, maxContextTokens?: number): Promise<{
        truncated: string;
        wasExceeded: boolean;
        removedTokens: number;
    }> {
        const maxContext = maxContextTokens || this.calculateMaxContextSize(systemPromptTokens, userMessageTokens);
        const currentContextTokens = await this.getTokenCountFromLLM(fullContext);
         
        if (currentContextTokens <= maxContext) {
            return { truncated: fullContext, wasExceeded: false, removedTokens: 0 };
        }
 
        // Try to remove oldest/least important context while keeping structure
        const lines = fullContext.split('\n');
        let truncated = fullContext;
        let removedTokens = currentContextTokens;
 
        // Remove non-critical sections (context items) first
        const sectionRegex = /^#+\s+/m;
        const sections = fullContext.split(sectionRegex).slice(1); // Skip first empty element
 
        if (sections.length > 1) {
            // Remove from the beginning (oldest context)
            truncated = sections.slice(1).join('\n---\n');
            removedTokens = currentContextTokens - await this.getTokenCountFromLLM(truncated);
 
            if (await this.getTokenCountFromLLM(truncated) <= maxContext) {
                return {
                    truncated,
                    wasExceeded: true,
                    removedTokens
                };
            }
        }
 
        // If still too large, truncate middle sections
        const maxChars = maxContext * 4;
        if (fullContext.length > maxChars) {
            truncated = fullContext.substring(0, maxChars);
            // Try to cut at a line break
            const lastNewline = truncated.lastIndexOf('\n');
            if (lastNewline > 0) {
                truncated = truncated.substring(0, lastNewline) + '\n... (context truncated)';
            }
        }
 
        return {
            truncated,
            wasExceeded: true,
            removedTokens: currentContextTokens - await this.getTokenCountFromLLM(truncated)
        };
    }

    /**
     * Create a summary of what was removed for the next turn
     */
    async createContinuationSummary(removedContext: string, taskSoFar: string): Promise<string> {
        const removedTokens = await this.getTokenCountFromLLM(removedContext);
        const summary = `## Continuation from Previous Turn
 
 The following context was temporarily removed due to token limits but is available if needed:
 - Removed ${removedTokens} tokens of previous context
 - Continue based on task progress: ${taskSoFar}
 
 To continue: refer to previous findings but focus on next steps.`;
         
        return summary;
    }

    /**
     * Get current configuration
     */
    getConfig(): TokenLimits {
        return this.limits;
    }

    /**
     * Reload configuration (in case settings changed)
     */
    reloadConfig(): void {
        this.limits = this.loadLimits();
        console.log(`[VIBEY][TokenManager] Configuration reloaded:`, this.limits);
    }

    /**
     * Reset the cumulative token count (e.g., when context is cleared)
     */
    resetCumulativeTokenCount(): void {
        console.log(`[VIBEY][TokenManager] Resetting cumulative token count`);
        // This method will be used to reset the cumulative token count when the context is cleared
    }

    /**
     * Format a human-readable token budget report
     */
    formatTokenReport(usage: TokenUsage, context?: string): string {
        const report = `Token Budget Report:
- System Prompt: ${usage.systemPrompt} tokens
- Context: ${usage.context} tokens
- User Message: ${usage.userMessage} tokens
- Tool Results: ${usage.toolResults} tokens
- Total Used: ${usage.total} tokens
- Max Available: ${this.limits.maxTokens} tokens
- Usage: ${this.getUsagePercentage(usage.total)}%
- Remaining: ${this.getRemainingTokens(usage.total)} tokens`;

        if (context) {
            return report + `\n- Status: ${this.isExceeded(usage.total) ? '❌ EXCEEDED' : this.isApproachingLimit(usage.total) ? '⚠️ WARNING' : '✅ OK'}`;
        }

        return report;
    }

    /**
     * Create a visual meter for context usage
     */
    createContextUsageMeter(currentTokens: number, maxTokens: number = this.limits.maxTokens): string {
        const percentage = this.getUsagePercentage(currentTokens);
        const usedBlocks = Math.min(20, Math.floor(percentage / 5));
        const emptyBlocks = Math.max(0, 20 - usedBlocks);
        const status = this.isExceeded(currentTokens) ? '❌ EXCEEDED' : this.isApproachingLimit(currentTokens) ? '⚠️ WARNING' : '✅ OK';

        return `📊 Context Usage Meter: [${'█'.repeat(usedBlocks)}${'░'.repeat(emptyBlocks)}] ${percentage}% (${currentTokens}/${maxTokens} tokens) ${status}`;
    }

    /**
     * Create a per-message token usage report
     */
    formatPerMessageTokenReport(messageTokens: number, currentTotal: number): string {
        const percentage = this.getUsagePercentage(currentTotal);
        const remaining = this.getRemainingTokens(currentTotal);
        const status = this.isExceeded(currentTotal) ? '❌ EXCEEDED' : this.isApproachingLimit(currentTotal) ? '⚠️ WARNING' : '✅ OK';

        return `📊 Per-Message Token Usage:
- This message: ${messageTokens} tokens
- Current total: ${currentTotal} tokens
- Usage: ${percentage}%
- Remaining: ${remaining} tokens
- Status: ${status}`;
    }
}

export function getTokenManager(): TokenManager {
    // Singleton instance
    if (!(global as any).vibeyTokenManager) {
        (global as any).vibeyTokenManager = new TokenManager();
    }
    return (global as any).vibeyTokenManager;
}
