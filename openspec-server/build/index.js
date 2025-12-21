#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs-extra";
import * as path from "path";
// OpenSpec MCP Server implementation
class OpenSpecMCPServer {
    workspaceRoot;
    openspecDir;
    specsDir;
    changesDir;
    activeSessions = new Map();
    projectContext = null;
    constructor(workspaceRoot = process.cwd()) {
        this.workspaceRoot = workspaceRoot;
        this.openspecDir = path.join(workspaceRoot, 'openspec');
        this.specsDir = path.join(this.openspecDir, 'specs');
        this.changesDir = path.join(this.openspecDir, 'changes');
        this.initializeDirectories();
    }
    async initializeDirectories() {
        await fs.ensureDir(this.openspecDir);
        await fs.ensureDir(this.specsDir);
        await fs.ensureDir(this.changesDir);
        // Create project.md if it doesn't exist
        const projectMdPath = path.join(this.openspecDir, 'project.md');
        if (!await fs.pathExists(projectMdPath)) {
            const defaultProjectMd = `# Project Context

## Overview
This project uses OpenSpec for specification-driven development.

## Tech Stack
- Add your technology stack here

## Conventions
- Add your coding conventions here

## Architecture
- Add your architecture patterns here
`;
            await fs.writeFile(projectMdPath, defaultProjectMd);
        }
        // Create AGENTS.md if it doesn't exist
        const agentsMdPath = path.join(this.openspecDir, 'AGENTS.md');
        if (!await fs.pathExists(agentsMdPath)) {
            const defaultAgentsMd = `# OpenSpec Agent Instructions

## Workflow
1. **Proposal**: Create change proposals with specs and tasks
2. **Apply**: Implement approved changes
3. **Archive**: Archive completed changes to living specs

## Commands
- Create proposal: "Create an OpenSpec proposal for [feature description]"
- Apply change: "Apply the OpenSpec change [change-id]"
- Archive change: "Archive the OpenSpec change [change-id]"
`;
            await fs.writeFile(agentsMdPath, defaultAgentsMd);
        }
    }
    // Core OpenSpec Operations
    async createProposal(description, context) {
        const proposalId = this.generateId();
        const timestamp = new Date();
        // Analyze the description to extract requirements
        const requirements = await this.extractRequirements(description);
        const tasks = await this.generateTasks(requirements);
        const proposal = {
            id: proposalId,
            title: this.extractTitle(description),
            description,
            specDeltas: await this.generateSpecDeltas(requirements),
            tasks,
            estimatedEffort: this.estimateEffort(tasks),
            dependencies: [],
            status: 'draft',
            createdAt: timestamp,
            updatedAt: timestamp
        };
        // Save proposal to filesystem
        const proposalDir = path.join(this.changesDir, proposalId);
        await fs.ensureDir(proposalDir);
        await fs.writeFile(path.join(proposalDir, 'proposal.json'), JSON.stringify(proposal, null, 2));
        // Create tasks.md file
        const tasksContent = this.generateTasksMarkdown(proposal.tasks);
        await fs.writeFile(path.join(proposalDir, 'tasks.md'), tasksContent);
        return proposal;
    }
    async applyChange(changeId) {
        try {
            const proposalPath = path.join(this.changesDir, changeId, 'proposal.json');
            if (!await fs.pathExists(proposalPath)) {
                return { success: false, message: `Change ${changeId} not found` };
            }
            const proposal = await fs.readJson(proposalPath);
            // Apply spec deltas
            for (const delta of proposal.specDeltas) {
                await this.applySpecDelta(delta);
            }
            // Update proposal status
            proposal.status = 'approved';
            proposal.updatedAt = new Date();
            await fs.writeFile(proposalPath, JSON.stringify(proposal, null, 2));
            return { success: true, message: `Change ${changeId} applied successfully` };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to apply change: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async archiveChange(changeId) {
        try {
            const proposalPath = path.join(this.changesDir, changeId, 'proposal.json');
            if (!await fs.pathExists(proposalPath)) {
                return { success: false, message: `Change ${changeId} not found` };
            }
            const proposal = await fs.readJson(proposalPath);
            // Move specs to living specs directory
            for (const delta of proposal.specDeltas) {
                if (delta.operation === 'create' || delta.operation === 'update') {
                    const specPath = path.join(this.specsDir, delta.path);
                    await fs.ensureDir(path.dirname(specPath));
                    if (delta.content) {
                        await fs.writeFile(specPath, delta.content);
                    }
                }
            }
            // Create archive record
            const archivePath = path.join(this.changesDir, changeId, 'archived.json');
            await fs.writeFile(archivePath, JSON.stringify({
                archivedAt: new Date(),
                proposal: proposal
            }, null, 2));
            return { success: true, message: `Change ${changeId} archived successfully` };
        }
        catch (error) {
            return {
                success: false,
                message: `Failed to archive change: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    // Interactive Discovery
    async startDiscovery(featureType, userInput) {
        const sessionId = this.generateId();
        const questions = await this.generateInitialQuestions(featureType);
        const session = {
            id: sessionId,
            featureType,
            userInput,
            questions,
            responses: [],
            context: {
                featureType,
                gatheredRequirements: [],
                identifiedComponents: [],
                technicalConstraints: []
            },
            completeness: 0,
            status: 'active'
        };
        this.activeSessions.set(sessionId, session);
        return session;
    }
    async answerQuestion(sessionId, questionId, answer) {
        const session = this.activeSessions.get(sessionId);
        if (!session) {
            throw new Error(`Discovery session ${sessionId} not found`);
        }
        // Record the response
        session.responses.push({
            questionId,
            answer,
            timestamp: new Date()
        });
        // Update context based on answer
        await this.updateDiscoveryContext(session, questionId, answer);
        // Generate next question or complete discovery
        const nextQuestion = await this.generateNextQuestion(session);
        if (nextQuestion) {
            session.questions.push(nextQuestion);
        }
        else {
            session.status = 'complete';
            session.completeness = 100;
        }
        this.activeSessions.set(sessionId, session);
        return nextQuestion;
    }
    async generateSpecFromDiscovery(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session || session.status !== 'complete') {
            throw new Error(`Discovery session ${sessionId} not complete`);
        }
        const spec = {
            id: this.generateId(),
            title: `${session.featureType} Specification`,
            overview: this.generateOverviewFromDiscovery(session),
            requirements: session.context.gatheredRequirements,
            acceptanceCriteria: this.generateAcceptanceCriteria(session),
            technicalDetails: this.generateTechnicalDetails(session),
            dependencies: this.identifyDependencies(session),
            version: '1.0.0',
            lastModified: new Date()
        };
        return spec;
    }
    // Specification Management
    async getSpecifications() {
        const specs = [];
        try {
            const specFiles = await this.findSpecFiles(this.specsDir);
            for (const specFile of specFiles) {
                try {
                    const content = await fs.readFile(specFile, 'utf-8');
                    const spec = this.parseSpecificationFromMarkdown(content, specFile);
                    specs.push(spec);
                }
                catch (error) {
                    console.error(`Error reading spec file ${specFile}:`, error);
                }
            }
        }
        catch (error) {
            console.error('Error reading specifications:', error);
        }
        return specs;
    }
    async validateSpecification(spec) {
        const errors = [];
        // Basic validation
        if (!spec.title || spec.title.trim().length === 0) {
            errors.push('Specification must have a title');
        }
        if (!spec.overview || spec.overview.trim().length === 0) {
            errors.push('Specification must have an overview');
        }
        if (!spec.requirements || spec.requirements.length === 0) {
            errors.push('Specification must have at least one requirement');
        }
        // Validate requirements
        for (const req of spec.requirements) {
            if (!req.title || !req.description) {
                errors.push(`Requirement ${req.id} is missing title or description`);
            }
        }
        // Validate acceptance criteria
        if (!spec.acceptanceCriteria || spec.acceptanceCriteria.length === 0) {
            errors.push('Specification must have acceptance criteria');
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    // Helper methods
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
    extractTitle(description) {
        // Extract a title from the description
        const lines = description.split('\n');
        const firstLine = lines[0].trim();
        return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine;
    }
    async extractRequirements(description) {
        // Simple requirement extraction - in a real implementation, this would use NLP
        const requirements = [];
        const sentences = description.split(/[.!?]+/).filter(s => s.trim().length > 0);
        sentences.forEach((sentence, index) => {
            if (sentence.toLowerCase().includes('should') ||
                sentence.toLowerCase().includes('must') ||
                sentence.toLowerCase().includes('need')) {
                requirements.push({
                    id: `req-${index + 1}`,
                    title: `Requirement ${index + 1}`,
                    description: sentence.trim(),
                    priority: 'medium'
                });
            }
        });
        return requirements;
    }
    async generateTasks(requirements) {
        const tasks = [];
        requirements.forEach((req, index) => {
            tasks.push({
                id: `task-${index + 1}`,
                description: `Implement ${req.title}`,
                status: 'pending',
                dependencies: []
            });
        });
        return tasks;
    }
    async generateSpecDeltas(requirements) {
        const deltas = [];
        // Generate a spec file delta
        const specContent = this.generateSpecMarkdown(requirements);
        deltas.push({
            operation: 'create',
            path: 'feature/spec.md',
            content: specContent
        });
        return deltas;
    }
    generateSpecMarkdown(requirements) {
        let content = `# Feature Specification

## Overview
This specification defines the requirements and implementation details for the requested feature.

## Requirements

`;
        requirements.forEach((req, index) => {
            content += `### ${req.title}
${req.description}

`;
        });
        content += `## Acceptance Criteria

`;
        requirements.forEach((req, index) => {
            content += `- ${req.description}
`;
        });
        return content;
    }
    estimateEffort(tasks) {
        const taskCount = tasks.length;
        if (taskCount <= 3)
            return 'Small (1-2 days)';
        if (taskCount <= 6)
            return 'Medium (3-5 days)';
        return 'Large (1+ weeks)';
    }
    generateTasksMarkdown(tasks) {
        let content = `# Implementation Tasks

## Tasks

`;
        tasks.forEach((task, index) => {
            content += `- [ ] ${index + 1}. ${task.description}
`;
        });
        return content;
    }
    async applySpecDelta(delta) {
        const fullPath = path.join(this.specsDir, delta.path);
        switch (delta.operation) {
            case 'create':
            case 'update':
                if (delta.content) {
                    await fs.ensureDir(path.dirname(fullPath));
                    await fs.writeFile(fullPath, delta.content);
                }
                break;
            case 'delete':
                if (await fs.pathExists(fullPath)) {
                    await fs.remove(fullPath);
                }
                break;
        }
    }
    async generateInitialQuestions(featureType) {
        // Template-based question generation
        const baseQuestions = [
            {
                id: 'q1',
                text: 'What is the main purpose of this feature?',
                type: 'open',
                required: true,
                category: 'purpose'
            },
            {
                id: 'q2',
                text: 'Who are the primary users of this feature?',
                type: 'open',
                required: true,
                category: 'users'
            }
        ];
        // Add feature-type specific questions
        if (featureType.toLowerCase().includes('api')) {
            baseQuestions.push({
                id: 'q3',
                text: 'What HTTP methods should this API support?',
                type: 'choice',
                options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                required: true,
                category: 'api'
            });
        }
        if (featureType.toLowerCase().includes('ui')) {
            baseQuestions.push({
                id: 'q3',
                text: 'What pages or views will users interact with?',
                type: 'open',
                required: true,
                category: 'ui'
            });
        }
        return baseQuestions;
    }
    async updateDiscoveryContext(session, questionId, answer) {
        // Update context based on the question and answer
        const question = session.questions.find(q => q.id === questionId);
        if (!question)
            return;
        if (question.category === 'purpose') {
            // Extract requirements from purpose description
            const requirements = await this.extractRequirements(answer);
            session.context.gatheredRequirements.push(...requirements);
        }
        // Update completeness
        const totalQuestions = session.questions.length;
        const answeredQuestions = session.responses.length;
        session.completeness = Math.round((answeredQuestions / totalQuestions) * 100);
    }
    async generateNextQuestion(session) {
        // Simple logic - in a real implementation, this would be more sophisticated
        const unansweredQuestions = session.questions.filter(q => !session.responses.some(r => r.questionId === q.id));
        if (unansweredQuestions.length > 0) {
            return unansweredQuestions[0];
        }
        // Generate follow-up questions based on previous answers
        if (session.responses.length < 5) {
            return {
                id: `followup-${session.responses.length}`,
                text: 'Are there any additional requirements or constraints we should consider?',
                type: 'open',
                required: false,
                category: 'additional'
            };
        }
        return null; // Discovery complete
    }
    generateOverviewFromDiscovery(session) {
        const purposeResponse = session.responses.find(r => session.questions.find(q => q.id === r.questionId)?.category === 'purpose');
        return purposeResponse ? purposeResponse.answer : 'Feature overview based on discovery session';
    }
    generateAcceptanceCriteria(session) {
        return session.context.gatheredRequirements.map((req, index) => ({
            id: `ac-${index + 1}`,
            description: `The system should ${req.description.toLowerCase()}`,
            testable: true
        }));
    }
    generateTechnicalDetails(session) {
        return [{
                component: 'Main Component',
                description: 'Primary implementation component',
                implementation: 'To be determined during implementation phase'
            }];
    }
    identifyDependencies(session) {
        // Simple dependency identification
        return [];
    }
    async findSpecFiles(dir) {
        const files = [];
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const subFiles = await this.findSpecFiles(fullPath);
                    files.push(...subFiles);
                }
                else if (entry.name.endsWith('.md')) {
                    files.push(fullPath);
                }
            }
        }
        catch (error) {
            // Directory doesn't exist or can't be read
        }
        return files;
    }
    parseSpecificationFromMarkdown(content, filePath) {
        // Simple markdown parsing - in a real implementation, this would be more robust
        const lines = content.split('\n');
        const title = lines.find(line => line.startsWith('# '))?.substring(2) || 'Untitled';
        return {
            id: path.basename(filePath, '.md'),
            title,
            overview: 'Parsed from markdown file',
            requirements: [],
            acceptanceCriteria: [],
            technicalDetails: [],
            dependencies: [],
            version: '1.0.0',
            lastModified: new Date()
        };
    }
}
// Create MCP server instance
const server = new Server({
    name: "openspec-server",
    version: "2.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Initialize OpenSpec server
const openspecServer = new OpenSpecMCPServer();
// Define tools
const tools = [
    {
        name: "openspec_create_proposal",
        description: "Create a new OpenSpec change proposal",
        inputSchema: {
            type: "object",
            properties: {
                description: {
                    type: "string",
                    description: "Description of the feature or change to implement"
                },
                context: {
                    type: "object",
                    description: "Additional context for the proposal",
                    properties: {}
                }
            },
            required: ["description"]
        }
    },
    {
        name: "openspec_apply_change",
        description: "Apply an approved OpenSpec change",
        inputSchema: {
            type: "object",
            properties: {
                changeId: {
                    type: "string",
                    description: "ID of the change to apply"
                }
            },
            required: ["changeId"]
        }
    },
    {
        name: "openspec_archive_change",
        description: "Archive a completed OpenSpec change",
        inputSchema: {
            type: "object",
            properties: {
                changeId: {
                    type: "string",
                    description: "ID of the change to archive"
                }
            },
            required: ["changeId"]
        }
    },
    {
        name: "openspec_start_discovery",
        description: "Start an interactive requirement discovery session",
        inputSchema: {
            type: "object",
            properties: {
                featureType: {
                    type: "string",
                    description: "Type of feature (e.g., 'API', 'UI', 'Database')"
                },
                userInput: {
                    type: "string",
                    description: "Initial user description of the feature"
                }
            },
            required: ["featureType", "userInput"]
        }
    },
    {
        name: "openspec_answer_question",
        description: "Answer a question in an active discovery session",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: {
                    type: "string",
                    description: "ID of the discovery session"
                },
                questionId: {
                    type: "string",
                    description: "ID of the question being answered"
                },
                answer: {
                    type: "string",
                    description: "Answer to the question"
                }
            },
            required: ["sessionId", "questionId", "answer"]
        }
    },
    {
        name: "openspec_generate_spec",
        description: "Generate a specification from a completed discovery session",
        inputSchema: {
            type: "object",
            properties: {
                sessionId: {
                    type: "string",
                    description: "ID of the completed discovery session"
                }
            },
            required: ["sessionId"]
        }
    },
    {
        name: "openspec_list_specifications",
        description: "List all existing specifications",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "openspec_validate_specification",
        description: "Validate a specification for completeness and quality",
        inputSchema: {
            type: "object",
            properties: {
                specification: {
                    type: "object",
                    description: "Specification object to validate"
                }
            },
            required: ["specification"]
        }
    }
];
// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "openspec_create_proposal": {
                const { description, context } = args;
                const proposal = await openspecServer.createProposal(description, context);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(proposal, null, 2)
                        }
                    ]
                };
            }
            case "openspec_apply_change": {
                const { changeId } = args;
                const result = await openspecServer.applyChange(changeId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            case "openspec_archive_change": {
                const { changeId } = args;
                const result = await openspecServer.archiveChange(changeId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            case "openspec_start_discovery": {
                const { featureType, userInput } = args;
                const session = await openspecServer.startDiscovery(featureType, userInput);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(session, null, 2)
                        }
                    ]
                };
            }
            case "openspec_answer_question": {
                const { sessionId, questionId, answer } = args;
                const nextQuestion = await openspecServer.answerQuestion(sessionId, questionId, answer);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({ nextQuestion }, null, 2)
                        }
                    ]
                };
            }
            case "openspec_generate_spec": {
                const { sessionId } = args;
                const spec = await openspecServer.generateSpecFromDiscovery(sessionId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(spec, null, 2)
                        }
                    ]
                };
            }
            case "openspec_list_specifications": {
                const specs = await openspecServer.getSpecifications();
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(specs, null, 2)
                        }
                    ]
                };
            }
            case "openspec_validate_specification": {
                const { specification } = args;
                const validation = await openspecServer.validateSpecification(specification);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(validation, null, 2)
                        }
                    ]
                };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`
                }
            ],
            isError: true
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Enhanced OpenSpec MCP server running on stdio');
}
main().catch((error) => {
    console.error('Server error:', error);
    process.exit(1);
});
