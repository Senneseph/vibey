
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface ChatMessage {
    role: string;
    content: string;
}

export class HistoryManager {
    private static readonly KEY = 'vibey.chatHistory';
    private readonly historyDir: string;
    private readonly historyFile: string;

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceRoot: string
    ) {
        this.historyDir = path.join(this.workspaceRoot, '.vibey');
        this.historyFile = path.join(this.historyDir, 'chat_history.json');
    }

    public async saveHistory(history: ChatMessage[]) {
        // 1. Persist to Workspace State (Backup/Fallback)
        await this.context.workspaceState.update(HistoryManager.KEY, history);

        // 2. Persist to File (.vibey/chat_history.json)
        try {
            await this.ensureHistoryDirectory();
            await this.ensureGitIgnore();
            await fs.promises.writeFile(this.historyFile, JSON.stringify(history, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save chat history to file:', error);
        }
    }

    public async loadHistory(): Promise<ChatMessage[]> {
        // 1. Try loading from File
        try {
            if (fs.existsSync(this.historyFile)) {
                const fileContent = await fs.promises.readFile(this.historyFile, 'utf-8');
                const history = JSON.parse(fileContent);
                if (Array.isArray(history)) {
                    return history;
                }
            }
        } catch (error) {
            console.error('Failed to load chat history from file:', error);
        }

        // 2. Fallback to Workspace State
        const stateHistory = this.context.workspaceState.get<ChatMessage[]>(HistoryManager.KEY);
        return stateHistory || [];
    }

    public async clearHistory() {
        await this.context.workspaceState.update(HistoryManager.KEY, undefined);
        try {
            if (fs.existsSync(this.historyFile)) {
                await fs.promises.unlink(this.historyFile);
            }
        } catch (error) {
            console.error('Failed to delete chat history file:', error);
        }
    }

    private async ensureHistoryDirectory() {
        if (!fs.existsSync(this.historyDir)) {
            await fs.promises.mkdir(this.historyDir, { recursive: true });
        }
    }

    private async ensureGitIgnore() {
        const gitIgnorePath = path.join(this.workspaceRoot, '.gitignore');
        const ignoreRule = '.vibey/';

        try {
            let content = '';
            if (fs.existsSync(gitIgnorePath)) {
                content = await fs.promises.readFile(gitIgnorePath, 'utf-8');
            }

            // Check if rule already exists
            if (!content.includes(ignoreRule) && !content.includes('.vibey')) {
                const newContent = content.endsWith('\n') || content.length === 0
                    ? `${content}${ignoreRule}\n`
                    : `${content}\n${ignoreRule}\n`;

                await fs.promises.writeFile(gitIgnorePath, newContent, 'utf-8');
            }
        } catch (error) {
            console.error('Failed to update .gitignore:', error);
            // Don't modify if we can't read/write safely
        }
    }
}
