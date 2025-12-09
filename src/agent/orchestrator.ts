import * as vscode from 'vscode';
import { AgentContext, LLMProvider } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';
import { ContextManager, ContextItem } from './context_manager';
import { getContextForTask, resolveContext } from './context_utils';
import { callLLM, parseLLMResponse } from './llm_utils';
import { executeTool, handleToolResult } from './tool_utils';
import { pushHistory, getHistory } from './history_utils';
import { formatError, handleAbort } from './error_utils';

export class AgentOrchestrator {
    private context: AgentContext;

    private contextManager: ContextManager;
    /**
     * Controller for managing request cancellation
     */
    private abortController: AbortController | null = null;

    public cancel() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }

    constructor(
        private llm: LLMProvider,
        private tools: ToolGateway,
        workspaceRoot: string
    ) {
        this.contextManager = new ContextManager();
        this.context = {
            workspaceRoot,
            history: [
                { role: 'system', content: this.getSystemPrompt() }
            ]
        };
    }

    private getSystemPrompt(): string {
        const toolDefs = this.tools.getToolDefinitions().map((t: ToolDefinition) => {
            return `## ${t.name}\n${t.description}\nParameters: ${JSON.stringify(t.parameters)}`;
        }).join('\n\n');

        return `You are Vibey, an expert autonomous coding agent.
You are running inside VS Code.

## Core Behavior

BE AUTONOMOUS. When given a task:
1. Gather information using tools
2. Plan your approach
3. EXECUTE the plan immediately - do NOT ask for permission
4. Continue working until the task is COMPLETE
5. Only stop when you have fully solved the problem

NEVER respond with "Would you like me to..." or "Should I...?" - just DO IT.
NEVER stop after gathering information - immediately proceed to implementation.
NEVER ask for confirmation before making changes - the user asked you to do something, so do it.

## Available Tools

${toolDefs}

## Response Format

When using tools, output ONLY a JSON block:
\`\`\`json
{
  "thought": "Brief reasoning about what I'm doing and why...",
  "tool_calls": [
    {
      "id": "unique_id",
      "name": "tool_name",
      "parameters": { ... }
    }
  ]
}
\`\`\`

When you are DONE with the entire task and have nothing more to do, respond with plain text summarizing what you accomplished.

## Important Rules

- Use tools to READ before you WRITE - understand the code first
- Make targeted, minimal changes - don't rewrite entire files
- If a tool fails, try a different approach
- Keep working until the task is fully complete
- For multi-step tasks, execute ALL steps in sequence without stopping
`;
    }



    async chat(userMessage: string, contextItems?: ContextItem[], onUpdate?: (update: any) => void): Promise<string> {
        handleAbort(this.abortController);
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        try {
            // Context block
            const contextBlock = contextItems && contextItems.length > 0
                ? await getContextForTask(this.contextManager, userMessage, contextItems)
                : '';
            pushHistory(this.context.history, { role: 'user', content: userMessage + contextBlock });
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Strategic planning with full context window...' });
            const MAX_TURNS = 256;
            let turns = 0;
            let finalResponse = '';
            while (turns < MAX_TURNS) {
                if (signal.aborted) throw new Error('Request cancelled by user');
                turns++;
                if (onUpdate) onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}: Reasoning...` });
                const responseText = await callLLM(this.llm, this.context.history, signal);
                if (signal.aborted) throw new Error('Request cancelled by user');
                const parsed = parseLLMResponse(responseText);
                if (!parsed || parsed.text) {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = responseText;
                    break;
                }
                if (parsed.thought && onUpdate) {
                    onUpdate({ type: 'thought', message: parsed.thought });
                }
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    for (const call of parsed.tool_calls) {
                        if (signal.aborted) throw new Error('Request cancelled by user');
                        try {
                            if (onUpdate) onUpdate({ type: 'tool_start', id: call.id, tool: call.name, parameters: call.parameters });
                            const result = await executeTool(this.tools, call);
                            if (onUpdate) onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: true, result });
                            handleToolResult(this.context.history, result, call);
                        } catch (error: any) {
                            if (onUpdate) onUpdate({ type: 'tool_end', id: call.id, tool: call.name, success: false, error: error.message });
                            handleToolResult(this.context.history, { status: 'error', error: error.message }, call);
                        }
                    }
                } else {
                    pushHistory(this.context.history, { role: 'assistant', content: responseText });
                    finalResponse = parsed.thought || responseText;
                    break;
                }
            }
            this.abortController = null;
            if (finalResponse) {
                return finalResponse;
            }
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Max turns reached. Summarizing progress...' });
            pushHistory(this.context.history, {
                role: 'user',
                content: "You have reached the maximum number of turns. Please provide a concise summary of what you have accomplished so far, what issues you encountered, and what steps should be taken next to complete the task."
            });
            const summary = await callLLM(this.llm, this.context.history, signal);
            pushHistory(this.context.history, { role: 'assistant', content: summary });
            return `**Max Turns Reached (${MAX_TURNS})**\n\n${summary}`;
        } catch (error: any) {
            this.abortController = null;
            const errorMsg = formatError(error);
            if (onUpdate) onUpdate({ type: 'error', message: errorMsg });
            return `**Error:** ${errorMsg}`;
        }
    }
}
