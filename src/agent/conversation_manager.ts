import { ChatMessage } from './types';

export class ConversationManager {
    private history: ChatMessage[] = [];
    private systemPrompt: string;

    constructor(systemPrompt: string) {
        this.systemPrompt = systemPrompt;
        this.history = [{ role: 'system', content: systemPrompt }];
    }

    public getHistory(): ChatMessage[] {
        return [...this.history];
    }

    public addUserMessage(content: string): void {
        this.history.push({ role: 'user', content });
    }

    public addAssistantMessage(content: string): void {
        this.history.push({ role: 'assistant', content });
    }

    public addToolCallResult(toolCallId: string, result: any): void {
        // Add the tool call result as a tool message
        const toolMessage = `🔧 Tool Result: ${toolCallId}

${result.status === 'success' ? '✅ Success' : '❌ Error'}

${result.output ? `Output:\n${result.output}` : ''}
${result.error ? `Error:\n${result.error}` : ''}`;
        
        this.history.push({ role: 'tool', content: toolMessage });
        console.log(`[VIBEY][ConversationManager] Added tool result for ${toolCallId}`);
    }

    public clearHistory(): void {
        this.history = [{ role: 'system', content: this.systemPrompt }];
    }

    public getLastMessageRole(): string | null {
        if (this.history.length === 0) return null;
        return this.history[this.history.length - 1].role;
    }

    public ensureRoleAlternation(): void {
        // Ensure the conversation roles alternate correctly
        const lastRole = this.getLastMessageRole();
        
        if (lastRole === 'assistant') {
            // Check if the last assistant message contains tool calls
            const lastMessage = this.history[this.history.length - 1];
            if (typeof lastMessage.content === 'string') {
                // Check if it's a tool call response by looking for tool_calls pattern
                const hasToolCalls = lastMessage.content.includes('tool_calls');
                if (!hasToolCalls) {
                    // Only add placeholder if it's not a tool call response
                    this.history.push({ role: 'user', content: 'Continue with the next step.' });
                }
            }
        } else if (lastRole === 'tool') {
            // After a tool result, we need an assistant response
            // No need to add anything - the LLM will provide the assistant response
            console.log(`[VIBEY][ConversationManager] Tool result added, waiting for assistant response`);
        }
    }

    public getHistoryForLLM(): ChatMessage[] {
        // Ensure the conversation roles alternate correctly before sending to LLM
        this.ensureRoleAlternation();
        return [...this.history];
    }
}