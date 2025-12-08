
import { AgentOrchestrator } from '../agent/orchestrator';
import { OllamaClient } from '../llm/ollama';
import { ToolGateway } from '../tools/gateway';
import { PolicyEngine } from '../security/policy_engine';
import { createFileSystemTools } from '../tools/definitions/filesystem';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
    console.log("Starting Verification...");
    fs.appendFileSync('verification.log', `--- New Run ---\n`);

    // Mock environment
    const workspaceRoot = process.cwd();

    // Setup

    const policy = new PolicyEngine(workspaceRoot);
    const gateway = new ToolGateway(policy);
    createFileSystemTools(policy, workspaceRoot).forEach(t => gateway.registerTool(t));

    const llm = new OllamaClient();
    const agent = new AgentOrchestrator(llm, gateway, workspaceRoot);

    console.log("---------------------------------------------------");
    console.log("Test 1: Simple Hello (LLM Only)");
    const response1 = await agent.chat("Hi, are you working?");
    fs.appendFileSync('verification.log', `Test 1 Response: ${response1}\n`);
    console.log("Agent:", response1);

    console.log("---------------------------------------------------");
    console.log("Test 2: Tool Use (Write File)");
    const response2 = await agent.chat("Please create a file named 'test_output.txt' with the content 'Hello from Vibey Verification'.");
    fs.appendFileSync('verification.log', `Test 2 Response: ${response2}\n`);
    console.log("Agent:", response2);

    console.log("---------------------------------------------------");
    console.log("Test 3: Tool Use (Read File)");
    const response3 = await agent.chat("Read the content of 'test_output.txt' and tell me what it says.");
    fs.appendFileSync('verification.log', `Test 3 Response: ${response3}\n`);
    console.log("Agent:", response3);
}

main().catch(e => {
    console.error(e);
    fs.appendFileSync('verification.log', `Error: ${e.message}\n`);
});
