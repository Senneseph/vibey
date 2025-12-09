// History management utilities
export interface HistoryEntry {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}

export function pushHistory(history: HistoryEntry[], entry: HistoryEntry): void {
    history.push(entry);
}

export function getHistory(history: HistoryEntry[]): HistoryEntry[] {
    return history;
}
