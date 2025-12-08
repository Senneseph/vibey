/**
 * Enhanced Security Types
 * Fine-grained permissions, audit logging, and sandboxing
 */

export type PermissionLevel = 'deny' | 'prompt' | 'allow';
export type OperationType = 'read' | 'write' | 'execute' | 'delete' | 'network';
export type ResourceType = 'file' | 'directory' | 'terminal' | 'network' | 'process' | 'extension';

export interface Permission {
    resource: ResourceType;
    operation: OperationType;
    level: PermissionLevel;
    pattern?: string;               // Glob pattern for path matching
    reason?: string;                // Why this permission exists
}

export interface PermissionRequest {
    id: string;
    timestamp: number;
    resource: ResourceType;
    operation: OperationType;
    target: string;                 // Path or identifier
    context?: string;               // Why this is needed
    requestedBy: string;            // Tool or component requesting
}

export interface PermissionDecision {
    requestId: string;
    allowed: boolean;
    decidedBy: 'policy' | 'user' | 'auto';
    reason: string;
    timestamp: number;
}

export interface AuditEntry {
    id: string;
    timestamp: number;
    category: 'permission' | 'access' | 'execution' | 'security_violation';
    action: string;
    target: string;
    result: 'allowed' | 'denied' | 'error';
    details?: Record<string, unknown>;
    risk: 'low' | 'medium' | 'high';
}

export interface SecurityPolicy {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    priority: number;               // Higher = checked first
    
    // Conditions
    conditions: {
        resources?: ResourceType[];
        operations?: OperationType[];
        pathPatterns?: string[];
        commandPatterns?: string[];
    };
    
    // Actions
    action: PermissionLevel;
    requiresReason: boolean;
    auditLevel: 'none' | 'basic' | 'detailed';
}

export interface SandboxConfig {
    enabled: boolean;
    allowedPaths: string[];
    deniedPaths: string[];
    allowedCommands: string[];
    deniedCommands: string[];
    maxFileSize: number;            // bytes
    maxExecutionTime: number;       // ms
    networkAccess: boolean;
}

export interface SecurityContext {
    policies: SecurityPolicy[];
    sandbox: SandboxConfig;
    activePermissions: Permission[];
    recentAudit: AuditEntry[];
    pendingRequests: PermissionRequest[];
}

// Default security policies
export const DEFAULT_POLICIES: SecurityPolicy[] = [
    {
        id: 'block-git-writes',
        name: 'Protect Git Directory',
        description: 'Prevent modifications to .git directory',
        enabled: true,
        priority: 100,
        conditions: {
            resources: ['file', 'directory'],
            operations: ['write', 'delete'],
            pathPatterns: ['**/.git/**']
        },
        action: 'deny',
        requiresReason: false,
        auditLevel: 'detailed'
    },
    {
        id: 'prompt-external-files',
        name: 'Prompt for External Files',
        description: 'Require approval for files outside workspace',
        enabled: true,
        priority: 90,
        conditions: {
            resources: ['file', 'directory'],
            operations: ['read', 'write']
        },
        action: 'prompt',
        requiresReason: true,
        auditLevel: 'basic'
    },
    {
        id: 'block-dangerous-commands',
        name: 'Block Dangerous Commands',
        description: 'Prevent execution of destructive system commands',
        enabled: true,
        priority: 100,
        conditions: {
            resources: ['terminal', 'process'],
            operations: ['execute'],
            commandPatterns: [
                'rm -rf *',
                'rm -rf /',
                'mkfs*',
                'dd if=*',
                'shutdown*',
                'reboot*',
                ':(){:|:&};:',      // Fork bomb
                'chmod 777 *'
            ]
        },
        action: 'deny',
        requiresReason: false,
        auditLevel: 'detailed'
    },
    {
        id: 'allow-workspace-read',
        name: 'Allow Workspace Read',
        description: 'Allow reading files within workspace',
        enabled: true,
        priority: 50,
        conditions: {
            resources: ['file', 'directory'],
            operations: ['read']
        },
        action: 'allow',
        requiresReason: false,
        auditLevel: 'none'
    }
];

