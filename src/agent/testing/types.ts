/**
 * Types for the testing module
 */

export interface TestResult {
    feature: string;
    testName: string;
    success: boolean;
    message: string;
    details?: any;
    timestamp: number;
}

export interface FeatureTestReport {
    llmProvider: string;
    llmModel: string;
    timestamp: number;
    results: TestResult[];
    summary: {
        totalTests: number;
        passedTests: number;
        failedTests: number;
        successRate: number;
    };
}
