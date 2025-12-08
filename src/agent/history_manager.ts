
import * as vscode from 'vscode';

interface ChatMessage {
    role: string;
    content: string;
}

export class HistoryManager {
    private static readonly KEY = 'vibey.chatHistory';

    constructor(private context: vscode.ExtensionContext) { }

    public saveHistory(history: ChatMessage[]) {
        // Filter out system prompts to save space, or keep them if needed to restore context state
        // We probably want to keep everything to ensure state restoration is accurate.
        this.context.workspaceState.update(HistoryManager.KEY, history);
    }

    public loadHistory(): ChatMessage[] {
        const history = this.context.workspaceState.get<ChatMessage[]>(HistoryManager.KEY);
        return history || [];
    }

    public clearHistory() {
        this.context.workspaceState.update(HistoryManager.KEY, undefined);
    }
}
