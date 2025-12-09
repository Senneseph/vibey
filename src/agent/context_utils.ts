// Context handling utilities
import { ContextManager, ContextItem } from './context_manager';

export async function getContextForTask(contextManager: ContextManager, userMessage: string, contextItems?: ContextItem[]): Promise<string> {
    return await contextManager.getContextForTask(userMessage, contextItems || []);
}

export async function resolveContext(contextManager: ContextManager, contextItems?: ContextItem[]): Promise<string> {
    return await contextManager.resolveContext(contextItems || []);
}
