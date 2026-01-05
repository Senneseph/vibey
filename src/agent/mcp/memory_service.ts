/**
 * Memory Service - Manages memory bank for persistent context storage
 * Implements memory management as specified in MCP_SERVER_INTEGRATION_REPORT.md
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { McpService } from './mcp_service';

/**
 * Memory context structure
 */
export interface MemoryContext {
    sessionId: string;
    timestamp: number;
    context: Record<string, any>;
    metadata: {
        source: string;
        importance?: number;
        tags?: string[];
    };
}

/**
 * Memory bank statistics
 */
export interface MemoryStats {
    entryCount: number;
    totalSize: number;
    lastUpdated: number;
    memoryUsage: number;
}

/**
 * Memory usage warning levels
 */
export interface MemoryWarning {
    level: 'info' | 'warning' | 'critical';
    message: string;
    usagePercentage: number;
}

export class MemoryService {
    private memoryBankPath: string;
    private memoryBank: Record<string, MemoryContext> = {};
    private isLoaded: boolean = false;
    private maxMemorySize: number = 100 * 1024 * 1024; // 100MB default
    private listeners: ((stats: MemoryStats) => void)[] = [];

    constructor(
        private mcpService: McpService,
        private context: vscode.ExtensionContext
    ) {
        // Initialize memory bank path
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || process.cwd();
        this.memoryBankPath = path.join(workspaceRoot, '.kilocode', 'rules', 'memory-bank');
        
        // Ensure directory exists
        this.ensureMemoryBankDirectory();
    }

    /**
     * Ensure memory bank directory exists
     */
    private ensureMemoryBankDirectory(): void {
        try {
            if (!fs.existsSync(this.memoryBankPath)) {
                fs.mkdirSync(this.memoryBankPath, { recursive: true });
                console.log(`[Memory] Created memory bank directory: ${this.memoryBankPath}`);
            }
        } catch (error) {
            console.error('[Memory] Failed to create memory bank directory:', error);
        }
    }

    /**
     * Add a listener for memory updates
     */
    public addListener(listener: (stats: MemoryStats) => void): void {
        this.listeners.push(listener);
    }

    /**
     * Remove a listener
     */
    public removeListener(listener: (stats: MemoryStats) => void): void {
        const index = this.listeners.indexOf(listener);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * Load memory bank from disk
     */
    public async loadMemoryBank(): Promise<void> {
        try {
            console.log(`[Memory] Loading memory bank from ${this.memoryBankPath}`);
            
            const files = fs.readdirSync(this.memoryBankPath);
            this.memoryBank = {};
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.memoryBankPath, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const memoryContext = JSON.parse(content) as MemoryContext;
                    this.memoryBank[memoryContext.sessionId] = memoryContext;
                }
            }
            
            this.isLoaded = true;
            console.log(`[Memory] Loaded ${Object.keys(this.memoryBank).length} memory entries`);
            
            // Notify listeners
            const stats = this.getMemoryStats();
            this.notifyListeners(stats);
            
        } catch (error) {
            console.error('[Memory] Failed to load memory bank:', error);
            throw error;
        }
    }

    /**
     * Save memory bank to disk
     */
    public async updateMemoryBank(context: MemoryContext): Promise<void> {
        try {
            if (!this.isLoaded) {
                await this.loadMemoryBank();
            }
            
            // Store the context
            this.memoryBank[context.sessionId] = context;
            
            // Save to file
            const filePath = path.join(this.memoryBankPath, `${context.sessionId}.json`);
            const content = JSON.stringify(context, null, 2);
            fs.writeFileSync(filePath, content);
            
            console.log(`[Memory] Saved memory context: ${context.sessionId}`);
            
            // Check memory usage and warn if needed
            const warning = this.checkMemoryUsage();
            if (warning) {
                this.handleMemoryWarning(warning);
            }
            
            // Notify listeners
            const stats = this.getMemoryStats();
            this.notifyListeners(stats);
            
        } catch (error) {
            console.error('[Memory] Failed to update memory bank:', error);
            throw error;
        }
    }

    /**
     * Get memory context by session ID
     */
    public async getMemoryContext(sessionId: string): Promise<MemoryContext | undefined> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        return this.memoryBank[sessionId];
    }

    /**
     * Get all memory contexts
     */
    public async getAllMemoryContexts(): Promise<MemoryContext[]> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        return Object.values(this.memoryBank);
    }

    /**
     * Remove memory context by session ID
     */
    public async removeMemoryContext(sessionId: string): Promise<boolean> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        
        if (this.memoryBank[sessionId]) {
            delete this.memoryBank[sessionId];
            
            // Remove file
            const filePath = path.join(this.memoryBankPath, `${sessionId}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            console.log(`[Memory] Removed memory context: ${sessionId}`);
            
            // Notify listeners
            const stats = this.getMemoryStats();
            this.notifyListeners(stats);
            
            return true;
        }
        
        return false;
    }

    /**
     * Clear all memory contexts
     */
    public async clearMemoryBank(): Promise<void> {
        this.memoryBank = {};
        
        // Remove all files
        try {
            const files = fs.readdirSync(this.memoryBankPath);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.memoryBankPath, file);
                    fs.unlinkSync(filePath);
                }
            }
            console.log('[Memory] Cleared memory bank');
            
            // Notify listeners
            const stats = this.getMemoryStats();
            this.notifyListeners(stats);
            
        } catch (error) {
            console.error('[Memory] Failed to clear memory bank:', error);
            throw error;
        }
    }

    /**
     * Get memory statistics
     */
    public getMemoryStats(): MemoryStats {
        const entryCount = Object.keys(this.memoryBank).length;
        
        // Calculate total size
        let totalSize = 0;
        for (const context of Object.values(this.memoryBank)) {
            totalSize += JSON.stringify(context).length;
        }
        
        // Get last updated timestamp
        let lastUpdated = 0;
        for (const context of Object.values(this.memoryBank)) {
            if (context.timestamp > lastUpdated) {
                lastUpdated = context.timestamp;
            }
        }
        
        // Calculate memory usage percentage
        const memoryUsage = Math.round((totalSize / this.maxMemorySize) * 100);
        
        return {
            entryCount,
            totalSize,
            lastUpdated,
            memoryUsage
        };
    }

    /**
     * Check memory usage and return warning if needed
     */
    private checkMemoryUsage(): MemoryWarning | undefined {
        const stats = this.getMemoryStats();
        
        if (stats.memoryUsage > 90) {
            return {
                level: 'critical',
                message: `Memory usage is critical: ${stats.memoryUsage}%`,
                usagePercentage: stats.memoryUsage
            };
        } else if (stats.memoryUsage > 75) {
            return {
                level: 'warning',
                message: `Memory usage is high: ${stats.memoryUsage}%`,
                usagePercentage: stats.memoryUsage
            };
        } else if (stats.memoryUsage > 50) {
            return {
                level: 'info',
                message: `Memory usage is moderate: ${stats.memoryUsage}%`,
                usagePercentage: stats.memoryUsage
            };
        }
        
        return undefined;
    }

    /**
     * Handle memory warnings
     */
    private handleMemoryWarning(warning: MemoryWarning): void {
        console.warn(`[Memory] ${warning.level.toUpperCase()}: ${warning.message}`);
        
        // Show notification to user
        const messageItems: string[] = ['OK', 'Clear Memory', 'Increase Limit'];
        
        vscode.window.showWarningMessage(
            `[Memory] ${warning.message}. Consider clearing old memory entries.`,
            ...messageItems
        ).then(async (selection) => {
            if (selection === 'Clear Memory') {
                await this.clearMemoryBank();
                vscode.window.showInformationMessage('Memory bank cleared successfully');
            } else if (selection === 'Increase Limit') {
                this.maxMemorySize *= 2; // Double the memory limit
                vscode.window.showInformationMessage(`Memory limit increased to ${this.maxMemorySize / (1024 * 1024)}MB`);
            }
        });
    }

    /**
     * Notify all listeners about memory updates
     */
    private notifyListeners(stats: MemoryStats): void {
        this.listeners.forEach(listener => {
            try {
                listener(stats);
            } catch (e) {
                console.error('[Memory] Listener error:', e);
            }
        });
    }

    /**
     * Create a new memory context
     */
    public createMemoryContext(
        sessionId: string,
        context: Record<string, any>,
        source: string,
        metadata?: { importance?: number; tags?: string[] }
    ): MemoryContext {
        return {
            sessionId,
            timestamp: Date.now(),
            context,
            metadata: {
                source,
                importance: metadata?.importance,
                tags: metadata?.tags
            }
        };
    }

    /**
     * Search memory contexts by tags
     */
    public async searchMemoryByTags(tags: string[]): Promise<MemoryContext[]> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        
        return Object.values(this.memoryBank).filter(context => {
            return context.metadata.tags?.some(tag => tags.includes(tag));
        });
    }

    /**
     * Get memory contexts by importance (descending)
     */
    public async getMemoryByImportance(): Promise<MemoryContext[]> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        
        return Object.values(this.memoryBank).sort((a, b) => {
            return (b.metadata.importance || 0) - (a.metadata.importance || 0);
        });
    }

    /**
     * Get recent memory contexts (by timestamp, descending)
     */
    public async getRecentMemory(limit: number = 10): Promise<MemoryContext[]> {
        if (!this.isLoaded) {
            await this.loadMemoryBank();
        }
        
        return Object.values(this.memoryBank)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
}