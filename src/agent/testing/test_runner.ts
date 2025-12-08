/**
 * Test Runner
 * Executes tests and validation checks
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
    TestCase, TestResult, TestSuite, TestRun, ValidationCheck,
    TestingConfig, TestStatus, DEFAULT_TESTING_CONFIG
} from './types';

const execAsync = promisify(exec);

export class TestRunner {
    private tests: Map<string, TestCase> = new Map();
    private suites: Map<string, TestSuite> = new Map();
    private validations: Map<string, ValidationCheck> = new Map();
    private runs: TestRun[] = [];
    private currentRun?: TestRun;

    private static readonly STORAGE_KEY = 'vibey.testing.data';

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceRoot: string,
        private config: TestingConfig = DEFAULT_TESTING_CONFIG
    ) {
        this.loadState();
        this.registerBuiltInValidations();
    }

    // ==================== Test Registration ====================

    registerTest(test: Omit<TestCase, 'id'>): TestCase {
        const fullTest: TestCase = {
            ...test,
            id: crypto.randomUUID()
        };
        this.tests.set(fullTest.id, fullTest);
        this.saveState();
        return fullTest;
    }

    registerSuite(suite: Omit<TestSuite, 'id'>): TestSuite {
        const fullSuite: TestSuite = {
            ...suite,
            id: crypto.randomUUID()
        };
        this.suites.set(fullSuite.id, fullSuite);
        this.saveState();
        return fullSuite;
    }

    registerValidation(check: Omit<ValidationCheck, 'id'>): ValidationCheck {
        const fullCheck: ValidationCheck = {
            ...check,
            id: crypto.randomUUID()
        };
        this.validations.set(fullCheck.id, fullCheck);
        this.saveState();
        return fullCheck;
    }

    private registerBuiltInValidations(): void {
        // TypeScript compilation check
        this.validations.set('builtin-typescript', {
            id: 'builtin-typescript',
            name: 'TypeScript Compilation',
            description: 'Check for TypeScript compilation errors',
            type: 'types',
            command: 'npm run compile',
            triggers: ['file_change', 'pre_commit'],
            filePatterns: ['**/*.ts', '**/*.tsx'],
            failurePatterns: ['error TS'],
            blocking: true
        });

        // ESLint check
        this.validations.set('builtin-eslint', {
            id: 'builtin-eslint',
            name: 'ESLint',
            description: 'Check for linting errors',
            type: 'lint',
            command: 'npm run lint',
            triggers: ['file_change', 'pre_commit'],
            filePatterns: ['**/*.ts', '**/*.tsx', '**/*.js'],
            failurePatterns: ['error', 'warning'],
            blocking: false,
            autoFix: 'npm run lint -- --fix'
        });

        // npm test
        this.validations.set('builtin-test', {
            id: 'builtin-test',
            name: 'Unit Tests',
            description: 'Run unit tests',
            type: 'test',
            command: 'npm test',
            triggers: ['pre_commit'],
            failurePatterns: ['FAIL', 'failed'],
            blocking: true
        });
    }

    // ==================== Test Execution ====================

    async runTest(testId: string): Promise<TestResult> {
        const test = this.tests.get(testId);
        if (!test) {
            throw new Error(`Test not found: ${testId}`);
        }

        const startTime = Date.now();
        let status: TestStatus = 'running';
        let output = '';
        let error = '';
        const assertionResults: TestResult['assertions'] = [];

        try {
            // Run command if specified
            if (test.command) {
                const result = await execAsync(test.command, {
                    cwd: this.workspaceRoot,
                    timeout: test.timeout
                });
                output = result.stdout;
                if (result.stderr) {
                    error = result.stderr;
                }
            }

            // Run assertions
            if (test.assertions) {
                for (const assertion of test.assertions) {
                    const result = await this.runAssertion(assertion);
                    assertionResults.push(result);
                }
            }

            // Determine status
            const allAssertionsPassed = assertionResults.every(a => a.passed);
            status = allAssertionsPassed ? 'passed' : 'failed';

        } catch (err: any) {
            status = 'failed';
            error = err.message || String(err);
        }

        const result: TestResult = {
            testId,
            status,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            output,
            error: error || undefined,
            assertions: assertionResults.length > 0 ? assertionResults : undefined
        };

        return result;
    }

    private async runAssertion(assertion: NonNullable<TestCase['assertions']>[number]): Promise<NonNullable<TestResult['assertions']>[number]> {
        const target = path.resolve(this.workspaceRoot, assertion.target);
        
        switch (assertion.type) {
            case 'file_exists': {
                const exists = fs.existsSync(target);
                return {
                    assertion: `File exists: ${assertion.target}`,
                    passed: exists,
                    actual: exists ? 'exists' : 'not found',
                    expected: 'exists'
                };
            }
            case 'file_contains': {
                try {
                    const content = fs.readFileSync(target, 'utf-8');
                    const pattern = assertion.pattern ? new RegExp(assertion.pattern) : null;
                    const passed = pattern
                        ? pattern.test(content)
                        : content.includes(assertion.expected || '');
                    return {
                        assertion: `File contains: ${assertion.pattern || assertion.expected}`,
                        passed,
                        expected: assertion.expected || assertion.pattern
                    };
                } catch {
                    return {
                        assertion: `File contains: ${assertion.pattern || assertion.expected}`,
                        passed: false,
                        actual: 'File not readable'
                    };
                }
            }
            case 'command_succeeds': {
                try {
                    await execAsync(assertion.target, { cwd: this.workspaceRoot });
                    return {
                        assertion: `Command succeeds: ${assertion.target}`,
                        passed: true
                    };
                } catch (err: any) {
                    return {
                        assertion: `Command succeeds: ${assertion.target}`,
                        passed: false,
                        actual: err.message
                    };
                }
            }
            default:
                return {
                    assertion: `Unknown assertion type: ${assertion.type}`,
                    passed: false
                };
        }
    }

    // ==================== Suite Execution ====================

    async runSuite(suiteId: string, trigger: TestRun['trigger'] = 'manual'): Promise<TestRun> {
        const suite = this.suites.get(suiteId);
        if (!suite) {
            throw new Error(`Suite not found: ${suiteId}`);
        }

        const run: TestRun = {
            id: crypto.randomUUID(),
            suiteId,
            testIds: suite.testIds,
            startedAt: Date.now(),
            status: 'running',
            results: [],
            summary: { total: suite.testIds.length, passed: 0, failed: 0, skipped: 0 },
            trigger
        };

        this.currentRun = run;

        // Run setup
        if (suite.setup) {
            try {
                await execAsync(suite.setup, { cwd: this.workspaceRoot });
            } catch (err: any) {
                run.status = 'aborted';
                run.completedAt = Date.now();
                this.runs.push(run);
                this.saveState();
                throw new Error(`Suite setup failed: ${err.message}`);
            }
        }

        // Run tests
        for (const testId of suite.testIds) {
            if (run.status === 'aborted') break;

            const result = await this.runTest(testId);
            run.results.push(result);

            if (result.status === 'passed') run.summary.passed++;
            else if (result.status === 'failed') run.summary.failed++;
            else if (result.status === 'skipped') run.summary.skipped++;

            if (suite.stopOnFailure && result.status === 'failed') {
                run.status = 'aborted';
                break;
            }
        }

        // Run teardown
        if (suite.teardown) {
            try {
                await execAsync(suite.teardown, { cwd: this.workspaceRoot });
            } catch {
                // Log but don't fail
            }
        }

        run.status = 'completed';
        run.completedAt = Date.now();

        // Update suite stats
        suite.lastRunAt = run.completedAt;
        suite.lastResults = {
            passed: run.summary.passed,
            failed: run.summary.failed,
            skipped: run.summary.skipped,
            duration: run.completedAt - run.startedAt
        };

        this.runs.push(run);
        this.currentRun = undefined;
        this.saveState();

        return run;
    }

    // ==================== Validation Checks ====================

    async runValidation(checkId: string): Promise<{ passed: boolean; output: string }> {
        const check = this.validations.get(checkId);
        if (!check) {
            throw new Error(`Validation not found: ${checkId}`);
        }

        try {
            const { stdout, stderr } = await execAsync(check.command, {
                cwd: this.workspaceRoot,
                timeout: this.config.testTimeout
            });

            const output = stdout + stderr;

            // Check for failure patterns
            if (check.failurePatterns) {
                for (const pattern of check.failurePatterns) {
                    if (output.includes(pattern)) {
                        return { passed: false, output };
                    }
                }
            }

            return { passed: true, output };
        } catch (err: any) {
            return { passed: false, output: err.message || String(err) };
        }
    }

    async runPreCommitChecks(): Promise<{ canCommit: boolean; results: { name: string; passed: boolean }[] }> {
        const results: { name: string; passed: boolean }[] = [];
        let canCommit = true;

        for (const check of this.validations.values()) {
            if (!check.triggers.includes('pre_commit')) continue;

            const result = await this.runValidation(check.id);
            results.push({ name: check.name, passed: result.passed });

            if (!result.passed && check.blocking) {
                canCommit = false;
            }
        }

        return { canCommit, results };
    }

    // ==================== Query Methods ====================

    getTests(): TestCase[] {
        return Array.from(this.tests.values());
    }

    getSuites(): TestSuite[] {
        return Array.from(this.suites.values());
    }

    getValidations(): ValidationCheck[] {
        return Array.from(this.validations.values());
    }

    getRecentRuns(limit: number = 10): TestRun[] {
        return this.runs.slice(-limit).reverse();
    }

    // ==================== Persistence ====================

    private async saveState(): Promise<void> {
        const data = {
            tests: Array.from(this.tests.entries()),
            suites: Array.from(this.suites.entries()),
            validations: Array.from(this.validations.entries()),
            runs: this.runs.slice(-50)
        };
        await this.context.globalState.update(TestRunner.STORAGE_KEY, data);
    }

    private loadState(): void {
        const data = this.context.globalState.get<{
            tests: [string, TestCase][];
            suites: [string, TestSuite][];
            validations: [string, ValidationCheck][];
            runs: TestRun[];
        }>(TestRunner.STORAGE_KEY);

        if (data) {
            this.tests = new Map(data.tests || []);
            this.suites = new Map(data.suites || []);
            // Don't overwrite built-in validations
            for (const [id, check] of data.validations || []) {
                if (!id.startsWith('builtin-')) {
                    this.validations.set(id, check);
                }
            }
            this.runs = data.runs || [];
        }
    }
}
