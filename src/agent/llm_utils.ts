// LLM communication and response parsing utilities
import { LLMProvider } from './types';
import { HistoryEntry } from './history_utils';

export async function callLLM(llm: LLMProvider, history: HistoryEntry[], signal: AbortSignal): Promise<string> {
    return await llm.chat(history, signal);
}

export function parseLLMResponse(responseText: string): any {
    // Parse fenced JSON block or tool call JSON
    const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
    let jsonContent = null;
    if (fencedMatch) {
        jsonContent = fencedMatch[1].trim();
        if (jsonContent.startsWith('json')) {
            jsonContent = jsonContent.slice(4).trim();
        }
    } else {
        const toolCallPattern = /(\{\s*"(?:thought|tool_calls)"[\s\S]*?\})\s*$/;
        const jsonMatch = responseText.match(toolCallPattern);
        if (jsonMatch) {
            jsonContent = jsonMatch[1];
        }
    }
    if (!jsonContent) return { text: responseText };
    try {
        return JSON.parse(jsonContent);
    } catch {
        return { text: responseText };
    }
}
