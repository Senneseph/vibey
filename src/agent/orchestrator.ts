

import * as vscode from 'vscode';
import { AgentContext, LLMProvider } from './types';
import { ToolGateway } from '../tools/gateway';
import { ToolCall, ToolDefinition } from '../tools/schema';
import { ContextManager, ContextItem } from './context_manager';

export class AgentOrchestrator {
    private context: AgentContext;

    private contextManager: ContextManager;
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

        return `You are Vibey, an expert coding agent.
You are running inside VS Code.
You have access to the following tools:

${toolDefs}

ALWAYS use these tools to perform actions.
When you need to use a tool, output a JSON block matching the tool schema.
Response format:
\`\`\`json
{
  "thought": "Reasoning...",
  "tool_calls": [
    {
      "id": "unique_id",
      "name": "tool_name",
      "parameters": { ... }
    }
  ]
}
\`\`\`
Do not write normal text if you are using a tool. Output ONLY the JSON block.
`;
    }



    async chat(userMessage: string, contextItems?: ContextItem[], onUpdate?: (update: any) => void): Promise<string> {
        // Cancel any previous running request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            // Resolve context if any
            let fullMessage = userMessage;
            if (contextItems && contextItems.length > 0) {
                const contextBlock = await this.contextManager.resolveContext(contextItems);
                fullMessage += contextBlock;
            }

            // 1. Add user message
            this.context.history.push({ role: 'user', content: fullMessage });


            let turns = 0;
            const config = vscode.workspace.getConfiguration('vibey');
            const MAX_TURNS = config.get<number>('maxTurns') || 64;


            while (turns < MAX_TURNS) {
                if (signal.aborted) throw new Error('Request cancelled by user');
                turns++;

                // 2. Call LLM
                if (onUpdate) onUpdate({ type: 'thinking', message: turns === 1 ? 'Analyzing request...' : `Turn ${turns}/${MAX_TURNS}: Reasoning...` });


                const responseText = await this.llm.chat(this.context.history, signal);
                if (signal.aborted) throw new Error('Request cancelled by user');

                // 3. Parse Response
                // Check for JSON block
                const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/);

                if (!jsonMatch) {
                    // No tool call, just a text response.
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return responseText;
                }

                // Valid JSON candidate
                let parsed;
                try {
                    const jsonStr = jsonMatch[1] || jsonMatch[0];
                    parsed = JSON.parse(jsonStr);

                    // Emit thought if present
                    if (parsed.thought && onUpdate) {
                        onUpdate({ type: 'thought', message: parsed.thought });
                    }

                } catch (e) {
                    // Failed to parse, return raw text
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return responseText;
                }

                // 4. Execute Tools
                if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
                    this.context.history.push({ role: 'assistant', content: responseText });

                    // Execute sequentially

                    for (const call of parsed.tool_calls) {
                        if (signal.aborted) throw new Error('Request cancelled by user');
                        try {


                            if (onUpdate) onUpdate({
                                type: 'tool_start',
                                id: call.id,
                                tool: call.name,
                                parameters: call.parameters
                            });

                            const result = await this.tools.executeTool(call as ToolCall);


                            if (onUpdate) onUpdate({
                                type: 'tool_end',
                                id: call.id,
                                tool: call.name,
                                success: true,
                                result: result
                            });

                            this.context.history.push({
                                role: 'tool',
                                content: JSON.stringify(result)
                            });
                        } catch (error: any) {
                            if (onUpdate) onUpdate({
                                type: 'tool_end',
                                id: call.id,
                                tool: call.name,
                                success: false,
                                error: error.message
                            });

                            this.context.history.push({
                                role: 'tool',
                                content: JSON.stringify({
                                    role: 'tool_result',
                                    tool_call_id: call.id,
                                    status: 'error',
                                    error: error.message
                                })
                            });
                        }
                    }
                    // Loop continues to let LLM see tool output
                } else {
                    // Just thought/JSON response without tools
                    this.context.history.push({ role: 'assistant', content: responseText });
                    return parsed.thought || responseText;
                }
            }


            this.abortController = null;

            // Limit reached: Self-Reflection Turn
            if (onUpdate) onUpdate({ type: 'thinking', message: 'Max turns reached. Summarizing progress...' });

            this.context.history.push({
                role: 'user',
                content: "You have reached the maximum number of turns. Please provide a concise summary of what you have accomplished so far, what issues you encountered, and what steps should be taken next to complete the task."
            });

            const summary = await this.llm.chat(this.context.history, signal);
            this.context.history.push({ role: 'assistant', content: summary });

            return `**Max Turns Reached (${MAX_TURNS})**\n\n${summary}`;
        } catch (error: any) {
            this.abortController = null;
            if (error.message === 'Request cancelled by user') {
                return 'Request cancelled.';
            }
            throw error;

        }
    }
}
