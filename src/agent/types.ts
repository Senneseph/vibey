
import { ToolCall, ToolResult } from '../tools/schema';

export interface AgentContext {
    workspaceRoot: string;
    history: ChatMessage[];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string | ToolCall[] | ToolResult;
}

export interface LLMProvider {
    chat(messages: ChatMessage[]): Promise<string>; // Returns raw text (which might contain tool calls)
}
