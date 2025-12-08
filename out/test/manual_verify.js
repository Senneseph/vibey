"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const orchestrator_1 = require("../agent/orchestrator");
const ollama_1 = require("../llm/ollama");
const gateway_1 = require("../tools/gateway");
const policy_engine_1 = require("../security/policy_engine");
const filesystem_1 = require("../tools/definitions/filesystem");
const fs = __importStar(require("fs"));
async function main() {
    console.log("Starting Verification...");
    fs.appendFileSync('verification.log', `--- New Run ---\n`);
    // Mock environment
    const workspaceRoot = process.cwd();
    // Setup
    const policy = new policy_engine_1.PolicyEngine(workspaceRoot);
    const gateway = new gateway_1.ToolGateway(policy);
    (0, filesystem_1.createFileSystemTools)(policy, workspaceRoot).forEach(t => gateway.registerTool(t));
    const llm = new ollama_1.OllamaClient();
    const agent = new orchestrator_1.AgentOrchestrator(llm, gateway, workspaceRoot);
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
//# sourceMappingURL=manual_verify.js.map