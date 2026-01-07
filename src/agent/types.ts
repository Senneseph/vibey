
import { ToolCall, ToolResult } from '../tools/schema';

export interface AgentContext {
    workspaceRoot: string;
    history: ChatMessage[];
}


export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolResult?: ToolResult;
}

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export interface TaskStep {
    id: string;
    description: string;
    status: TaskStatus;
    createdAt: number;
    updatedAt?: number;
    startedAt?: number;
    completedAt?: number;
    contextRequired?: string; // New property to track required context for a step
}

export interface Task {
    id: string;
    title: string;
    status: TaskStatus;
    steps: TaskStep[];
    createdAt: number;
    updatedAt: number;
    
    // New properties for atomic changes
    description?: string;
    contextItems?: string[];
    progress?: {
        completedSteps: number;
        totalSteps: number;
        percentage: number;
    };
    
    // Checkpoint tracking
    checkpoints?: {
        id: string;
        timestamp: number;
        summary: string;
        completedSteps: number[];
        stepsCount: number;
    }[];
}


export interface LLMProvider {
    chat(messages: ChatMessage[], signal?: AbortSignal): Promise<{
        content: string; // Returns raw text (which might contain tool calls)
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    }>;
    listModels(): Promise<string[]>;
}
