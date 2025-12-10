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

export class DailyHistoryManager {
    private readonly historyDir: string;
    private readonly sessionsFile: string;
    private readonly currentSessionId: string | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private workspaceRoot: string
    ) {
        this.historyDir = path.join(this.workspaceRoot, '.vibey', 'history');
        this.sessionsFile = path.join(this.historyDir, 'sessions.json');
    }

    public async saveHistory(history: ChatMessage[]) {
        // 1. Persist to Workspace State (Backup/Fallback)
        await this.context.workspaceState.update('vibey.chatHistory', history);

        // 2. Persist to Daily File
        try {
            await this.ensureHistoryDirectory();
            const dailyFile = this.getDailyHistoryFile();
            await fs.promises.writeFile(dailyFile, JSON.stringify(history, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to save chat history to daily file:', error);
        }

        // 3. Save session information
        await this.saveSession(history);
    }

    public async loadHistory(): Promise<ChatMessage[]> {
        // 1. Try loading from Daily File (most recent)
        try {
            const dailyFile = this.getDailyHistoryFile();
            if (fs.existsSync(dailyFile)) {
                const fileContent = await fs.promises.readFile(dailyFile, 'utf-8');
                const history = JSON.parse(fileContent);
                if (Array.isArray(history)) {
                    return history;
                }
            }
        } catch (error) {
            console.error('Failed to load chat history from daily file:', error);
        }

        // 2. Fallback to Workspace State
        const stateHistory = this.context.workspaceState.get<ChatMessage[]>('vibey.chatHistory');
        return stateHistory || [];
    }

    public async loadHistoryForDate(date: Date): Promise<ChatMessage[]> {
        try {
            const dailyFile = this.getHistoryFileForDate(date);
            if (fs.existsSync(dailyFile)) {
                const fileContent = await fs.promises.readFile(dailyFile, 'utf-8');
                const history = JSON.parse(fileContent);
                if (Array.isArray(history)) {
                    return history;
                }
            }
        } catch (error) {
            console.error('Failed to load chat history for date:', date, error);
        }
        
        return [];
    }

    public async clearHistory() {
        // Clear workspace state
        await this.context.workspaceState.update('vibey.chatHistory', undefined);
        
        // Clear daily files
        try {
            const dailyFile = this.getDailyHistoryFile();
            if (fs.existsSync(dailyFile)) {
                await fs.promises.unlink(dailyFile);
            }
        } catch (error) {
            console.error('Failed to delete daily chat history file:', error);
        }
        
        // Clear sessions too
        await this.clearSessions();
    }

    public async saveSession(history: ChatMessage[]) {
        // Create or update session
        const sessionId = this.generateSessionId();
        
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

    public async loadAllHistory(): Promise<{date: string, history: ChatMessage[]}[]> {
        const allHistories: {date: string, history: ChatMessage[]}[] = [];
        
        try {
            const dailyFiles = fs.readdirSync(this.historyDir)
                .filter(file => file.startsWith('chat_') && file.endsWith('.json'))
                .sort((a, b) => b.localeCompare(a)); // Newest first
            
            for (const file of dailyFiles) {
                const filePath = path.join(this.historyDir, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const history = JSON.parse(content);
                
                // Extract date from filename (chat_2023-12-01.json)
                const date = file.replace('chat_', '').replace('.json', '');
                allHistories.push({ date, history });
            }
        } catch (error) {
            console.error('Failed to load all history:', error);
        }
        
        return allHistories;
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

    private getDailyHistoryFile(): string {
        const today = new Date();
        const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        return path.join(this.historyDir, `chat_${dateStr}.json`);
    }

    private getHistoryFileForDate(date: Date): string {
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return path.join(this.historyDir, `chat_${dateStr}.json`);
    }

    private async ensureHistoryDirectory() {
        if (!fs.existsSync(this.historyDir)) {
            await fs.promises.mkdir(this.historyDir, { recursive: true });
        }
    }
}
