import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface AgentUpdate {
    type: 'thought' | 'tool_start' | 'tool_end';
    id?: string;
    tool?: string;
    parameters?: any;
    success?: boolean;
    result?: any;
    error?: string;
    message?: string;
}

interface ChatMessage {
    role: string;
    content: string;
    timestamp?: number;
    agentUpdates?: AgentUpdate[];  // Store tool execution details with the message
}

interface ChatSession {
    sessionId: string;
    history: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export class HistoryManager {
    private static readonly KEY = 'vibey.chatHistory';
    private static readonly SESSIONS_KEY = 'vibey.chatSessions';
    private readonly historyDir: string;
    private readonly historyFile: string;
    private readonly sessionsFile: string;
    private currentSessionId: string | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceRoot: string
    ) {
        this.historyDir = path.join(this.workspaceRoot, '.vibey');
        this.historyFile = path.join(this.historyDir, 'chat_history.json');
        this.sessionsFile = path.join(this.historyDir, 'sessions.json');
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

        // 3. Save session information
        await this.saveSession(history);
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
        
        // Clear sessions too
        await this.clearSessions();
    }

    public async saveSession(history: ChatMessage[]) {
        // Create or update session
        const sessionId = this.generateSessionId();
        this.currentSessionId = sessionId;
        
        const session: ChatSession = {
            sessionId,
            history,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        // Load existing sessions
        const sessions = await this.loadSessions();
        
        // Remove old sessions (keep only last 10)
        sessions.push(session);
        if (sessions.length > 10) {
            sessions.shift(); // Remove oldest
        }
        
        // Save sessions
        try {
            await this.ensureHistoryDirectory();
            await fs.promises.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save chat sessions:', error);
        }
    }

    public async loadSession(sessionId: string): Promise<ChatMessage[] | null> {
        try {
            if (fs.existsSync(this.sessionsFile)) {
                const fileContent = await fs.promises.readFile(this.sessionsFile, 'utf-8');
                const sessions: ChatSession[] = JSON.parse(fileContent);
                
                const session = sessions.find(s => s.sessionId === sessionId);
                return session ? session.history : null;
            }
        } catch (error) {
            console.error('Failed to load chat session:', error);
        }
        
        return null;
    }

    public async loadLatestSession(): Promise<ChatMessage[] | null> {
        try {
            if (fs.existsSync(this.sessionsFile)) {
                const fileContent = await fs.promises.readFile(this.sessionsFile, 'utf-8');
                const sessions: ChatSession[] = JSON.parse(fileContent);
                
                if (sessions.length > 0) {
                    // Return the most recent session
                    return sessions[sessions.length - 1].history;
                }
            }
        } catch (error) {
            console.error('Failed to load latest chat session:', error);
        }
        
        return null;
    }

    private async loadSessions(): Promise<ChatSession[]> {
        try {
            if (fs.existsSync(this.sessionsFile)) {
                const fileContent = await fs.promises.readFile(this.sessionsFile, 'utf-8');
                return JSON.parse(fileContent);
            }
        } catch (error) {
            console.error('Failed to load chat sessions:', error);
        }
        
        return [];
    }

    private async clearSessions() {
        try {
            if (fs.existsSync(this.sessionsFile)) {
                await fs.promises.unlink(this.sessionsFile);
            }
        } catch (error) {
            console.error('Failed to delete chat sessions file:', error);
        }
    }

    private generateSessionId(): string {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    private async ensureHistoryDirectory() {
        if (!fs.existsSync(this.historyDir)) {
            await fs.promises.mkdir(this.historyDir, { recursive: true });
        }
    }


    private gitIgnoreChecked = false;

    private async ensureGitIgnore() {
        if (this.gitIgnoreChecked) return;

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
        } finally {
            this.gitIgnoreChecked = true;
        }
    }
}
