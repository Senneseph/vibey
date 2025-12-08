/**
 * Enhanced Security Manager
 * Provides fine-grained permissions, audit logging, and sandboxing
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    Permission, PermissionLevel, PermissionRequest, PermissionDecision,
    AuditEntry, SecurityPolicy, SandboxConfig, SecurityContext,
    ResourceType, OperationType, DEFAULT_POLICIES
} from './types';

export class SecurityManager {
    private policies: Map<string, SecurityPolicy> = new Map();
    private auditLog: AuditEntry[] = [];
    private pendingRequests: Map<string, PermissionRequest> = new Map();
    private userDecisions: Map<string, PermissionDecision> = new Map();
    
    private static readonly STORAGE_KEY = 'vibey.security.data';
    private static readonly MAX_AUDIT_ENTRIES = 1000;

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceRoot: string,
        private sandbox: SandboxConfig = SecurityManager.defaultSandbox()
    ) {
        // Load default policies
        for (const policy of DEFAULT_POLICIES) {
            this.policies.set(policy.id, policy);
        }
        this.loadState();
    }

    // ==================== Permission Checking ====================

    async checkPermission(
        resource: ResourceType,
        operation: OperationType,
        target: string,
        requestedBy: string = 'unknown'
    ): Promise<{ allowed: boolean; reason: string }> {
        // 1. Check sandbox restrictions first
        if (this.sandbox.enabled) {
            const sandboxResult = this.checkSandbox(resource, operation, target);
            if (!sandboxResult.allowed) {
                this.audit('security_violation', `Sandbox blocked: ${operation} on ${target}`, target, 'denied', 'high');
                return sandboxResult;
            }
        }

        // 2. Check policies (sorted by priority)
        const sortedPolicies = Array.from(this.policies.values())
            .filter(p => p.enabled)
            .sort((a, b) => b.priority - a.priority);

        for (const policy of sortedPolicies) {
            if (this.policyMatches(policy, resource, operation, target)) {
                switch (policy.action) {
                    case 'deny':
                        this.audit('permission', `Policy denied: ${policy.name}`, target, 'denied', 'medium');
                        return { allowed: false, reason: policy.description };
                    
                    case 'allow':
                        if (policy.auditLevel !== 'none') {
                            this.audit('access', `Policy allowed: ${policy.name}`, target, 'allowed', 'low');
                        }
                        return { allowed: true, reason: policy.description };
                    
                    case 'prompt':
                        return await this.promptUser(resource, operation, target, requestedBy, policy);
                }
            }
        }

        // 3. Default: Check if within workspace
        const resolved = path.resolve(this.workspaceRoot, target);
        if (resolved.startsWith(this.workspaceRoot)) {
            return { allowed: true, reason: 'Within workspace' };
        }

        // 4. Default deny for external paths
        this.audit('permission', `Default deny: outside workspace`, target, 'denied', 'medium');
        return { allowed: false, reason: 'Path outside workspace requires explicit permission' };
    }

    private checkSandbox(
        resource: ResourceType,
        operation: OperationType,
        target: string
    ): { allowed: boolean; reason: string } {
        const resolved = path.resolve(this.workspaceRoot, target);

        // Check denied paths
        for (const denied of this.sandbox.deniedPaths) {
            if (this.matchesPattern(resolved, denied)) {
                return { allowed: false, reason: `Sandbox: path matches denied pattern ${denied}` };
            }
        }

        // Check allowed paths (if list is non-empty, only allow those)
        if (this.sandbox.allowedPaths.length > 0) {
            const allowed = this.sandbox.allowedPaths.some(p => this.matchesPattern(resolved, p));
            if (!allowed) {
                return { allowed: false, reason: 'Sandbox: path not in allowed list' };
            }
        }

        // Check commands for terminal/process
        if ((resource === 'terminal' || resource === 'process') && operation === 'execute') {
            for (const denied of this.sandbox.deniedCommands) {
                if (target.includes(denied) || this.matchesPattern(target, denied)) {
                    return { allowed: false, reason: `Sandbox: command matches denied pattern` };
                }
            }
        }

        // Check network access
        if (resource === 'network' && !this.sandbox.networkAccess) {
            return { allowed: false, reason: 'Sandbox: network access disabled' };
        }

        return { allowed: true, reason: 'Sandbox: passed all checks' };
    }

    private policyMatches(
        policy: SecurityPolicy,
        resource: ResourceType,
        operation: OperationType,
        target: string
    ): boolean {
        const { conditions } = policy;

        // Check resource type
        if (conditions.resources && !conditions.resources.includes(resource)) {
            return false;
        }

        // Check operation type
        if (conditions.operations && !conditions.operations.includes(operation)) {
            return false;
        }

        // Check path patterns
        if (conditions.pathPatterns) {
            const resolved = path.resolve(this.workspaceRoot, target);
            const matches = conditions.pathPatterns.some(p => this.matchesPattern(resolved, p));
            if (!matches) return false;
        }

        // Check command patterns
        if (conditions.commandPatterns) {
            const matches = conditions.commandPatterns.some(p => 
                target.includes(p.replace('*', '')) || this.matchesPattern(target, p)
            );
            if (!matches) return false;
        }

        return true;
    }

    private async promptUser(
        resource: ResourceType,
        operation: OperationType,
        target: string,
        requestedBy: string,
        policy: SecurityPolicy
    ): Promise<{ allowed: boolean; reason: string }> {
        const request: PermissionRequest = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            resource,
            operation,
            target,
            requestedBy
        };

        // Check if we have a cached decision for this pattern
        const cacheKey = `${resource}:${operation}:${target}`;
        const cached = this.userDecisions.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
            return { allowed: cached.allowed, reason: cached.reason };
        }

        this.pendingRequests.set(request.id, request);

        const answer = await vscode.window.showWarningMessage(
            `${requestedBy} wants to ${operation} ${resource}: ${target}`,
            { modal: true },
            'Allow Once',
            'Allow Always',
            'Deny'
        );

        const decision: PermissionDecision = {
            requestId: request.id,
            allowed: answer === 'Allow Once' || answer === 'Allow Always',
            decidedBy: 'user',
            reason: answer || 'User dismissed',
            timestamp: Date.now()
        };

        // Cache "Always" decisions
        if (answer === 'Allow Always') {
            this.userDecisions.set(cacheKey, decision);
        }

        this.pendingRequests.delete(request.id);
        this.audit('permission', `User decision: ${answer}`, target, decision.allowed ? 'allowed' : 'denied', 'medium');
        this.saveState();

        return { allowed: decision.allowed, reason: decision.reason };
    }

    // ==================== Audit Logging ====================

    audit(
        category: AuditEntry['category'],
        action: string,
        target: string,
        result: AuditEntry['result'],
        risk: AuditEntry['risk'],
        details?: Record<string, unknown>
    ): void {
        const entry: AuditEntry = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            category,
            action,
            target,
            result,
            details,
            risk
        };

        this.auditLog.push(entry);

        // Trim old entries
        if (this.auditLog.length > SecurityManager.MAX_AUDIT_ENTRIES) {
            this.auditLog = this.auditLog.slice(-SecurityManager.MAX_AUDIT_ENTRIES);
        }

        // Log high-risk events to console
        if (risk === 'high') {
            console.warn(`[SECURITY] ${action}: ${target} - ${result}`);
        }

        this.saveState();
    }

    getAuditLog(filter?: { category?: AuditEntry['category']; risk?: AuditEntry['risk'] }): AuditEntry[] {
        let entries = [...this.auditLog];
        if (filter?.category) {
            entries = entries.filter(e => e.category === filter.category);
        }
        if (filter?.risk) {
            entries = entries.filter(e => e.risk === filter.risk);
        }
        return entries.sort((a, b) => b.timestamp - a.timestamp);
    }

    getSecurityViolations(): AuditEntry[] {
        return this.getAuditLog({ category: 'security_violation' });
    }

    // ==================== Policy Management ====================

    addPolicy(policy: SecurityPolicy): void {
        this.policies.set(policy.id, policy);
        this.saveState();
    }

    removePolicy(policyId: string): boolean {
        const result = this.policies.delete(policyId);
        if (result) this.saveState();
        return result;
    }

    enablePolicy(policyId: string, enabled: boolean): void {
        const policy = this.policies.get(policyId);
        if (policy) {
            policy.enabled = enabled;
            this.saveState();
        }
    }

    getContext(): SecurityContext {
        return {
            policies: Array.from(this.policies.values()),
            sandbox: this.sandbox,
            activePermissions: [],  // Could track active session permissions
            recentAudit: this.auditLog.slice(-50),
            pendingRequests: Array.from(this.pendingRequests.values())
        };
    }

    // ==================== Helpers ====================

    private matchesPattern(str: string, pattern: string): boolean {
        // Simple glob matching
        const regex = new RegExp(
            '^' + pattern
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.')
                .replace(/\//g, '[\\\\/]') + '$',
            'i'
        );
        return regex.test(str);
    }

    static defaultSandbox(): SandboxConfig {
        return {
            enabled: true,
            allowedPaths: [],
            deniedPaths: ['**/.git/**', '**/node_modules/**/.git/**'],
            allowedCommands: [],
            deniedCommands: ['rm -rf /', 'mkfs', 'dd if=', 'shutdown', 'reboot'],
            maxFileSize: 10 * 1024 * 1024,  // 10MB
            maxExecutionTime: 60000,         // 60 seconds
            networkAccess: false
        };
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            policies: Array.from(this.policies.entries()),
            auditLog: this.auditLog.slice(-500),  // Keep last 500
            userDecisions: Array.from(this.userDecisions.entries())
        };
        await this.context.globalState.update(SecurityManager.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            policies: [string, SecurityPolicy][];
            auditLog: AuditEntry[];
            userDecisions: [string, PermissionDecision][];
        }>(SecurityManager.STORAGE_KEY);

        if (data) {
            // Merge with defaults (don't overwrite built-in policies)
            if (data.policies) {
                for (const [id, policy] of data.policies) {
                    if (!this.policies.has(id)) {
                        this.policies.set(id, policy);
                    }
                }
            }
            this.auditLog = data.auditLog || [];
            this.userDecisions = new Map(data.userDecisions || []);
        }
    }

    clearAllData(): void {
        this.auditLog = [];
        this.userDecisions.clear();
        this.saveState();
    }
}
