/**
 * Testing Framework Types
 * Self-testing capabilities for validating changes
 */

export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
export type TestType = 'unit' | 'integration' | 'validation' | 'smoke' | 'regression';

export interface TestCase {
    id: string;
    name: string;
    description: string;
    type: TestType;
    
    // Execution
    command?: string;               // Shell command to run test
    file?: string;                  // Test file path
    timeout: number;                // ms
    
    // Assertions (for validation tests)
    assertions?: {
        type: 'file_exists' | 'file_contains' | 'command_succeeds' | 'no_errors' | 'custom';
        target: string;
        expected?: string;
        pattern?: string;
    }[];
    
    // Dependencies
    requires?: string[];            // Other test IDs that must pass first
    
    // Metadata
    tags: string[];
    priority: number;               // Higher = run first
}

export interface TestResult {
    testId: string;
    status: TestStatus;
    duration: number;               // ms
    timestamp: number;
    
    // Details
    output?: string;
    error?: string;
    assertions?: {
        assertion: string;
        passed: boolean;
        actual?: string;
        expected?: string;
    }[];
    
    // Coverage info (if available)
    coverage?: {
        lines: number;
        functions: number;
        branches: number;
    };
}

export interface TestSuite {
    id: string;
    name: string;
    description: string;
    
    // Tests
    testIds: string[];
    
    // Configuration
    setup?: string;                 // Command to run before tests
    teardown?: string;              // Command to run after tests
    parallel: boolean;              // Run tests in parallel
    stopOnFailure: boolean;
    
    // Results
    lastRunAt?: number;
    lastResults?: {
        passed: number;
        failed: number;
        skipped: number;
        duration: number;
    };
}

export interface TestRun {
    id: string;
    suiteId?: string;
    testIds: string[];
    
    // Execution
    startedAt: number;
    completedAt?: number;
    status: 'running' | 'completed' | 'aborted';
    
    // Results
    results: TestResult[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    
    // Trigger
    trigger: 'manual' | 'pre_commit' | 'post_change' | 'scheduled';
    triggeredBy?: string;
}

export interface ValidationCheck {
    id: string;
    name: string;
    description: string;
    
    // What to validate
    type: 'syntax' | 'types' | 'lint' | 'build' | 'test' | 'security';
    command: string;
    
    // When to run
    triggers: ('file_change' | 'pre_commit' | 'manual')[];
    filePatterns?: string[];        // Only run for matching files
    
    // Interpretation
    successPatterns?: string[];     // Patterns indicating success
    failurePatterns?: string[];     // Patterns indicating failure
    
    // Metadata
    blocking: boolean;              // Block commit if fails
    autoFix?: string;               // Command to auto-fix issues
}

export interface TestingConfig {
    enableAutoTest: boolean;
    runBeforeCommit: boolean;
    testTimeout: number;
    parallelTests: number;
    coverageThreshold?: {
        lines: number;
        functions: number;
        branches: number;
    };
}

export const DEFAULT_TESTING_CONFIG: TestingConfig = {
    enableAutoTest: true,
    runBeforeCommit: true,
    testTimeout: 60000,
    parallelTests: 4
};

