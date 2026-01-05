// LLM communication and response parsing utilities
import { LLMProvider } from './types';
import { HistoryEntry } from './history_utils';

export async function callLLM(llm: LLMProvider, history: HistoryEntry[], signal: AbortSignal): Promise<string> {
    return await llm.chat(history, signal);
}

export function parseLLMResponse(responseText: string, onUpdate?: (update: any) => void): any {
    console.log(`[VIBEY][LLM_Utils] Parsing LLM response...`);

    // Parse fenced JSON block or tool call JSON
    const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
    let jsonContent = null;
    if (fencedMatch) {
        console.log(`[VIBEY][LLM_Utils] Found fenced JSON block`);
        jsonContent = fencedMatch[1].trim();
        if (jsonContent.startsWith('json')) {
            jsonContent = jsonContent.slice(4).trim();
        }
        console.log(`[VIBEY][LLM_Utils] Extracted JSON content (first 200 chars): ${jsonContent.substring(0, 200)}`);
    } else {
        console.log(`[VIBEY][LLM_Utils] No fenced JSON block found, trying inline pattern`);
        const toolCallPattern = /(\{\s*"(?:thought|tool_calls)"[\s\S]*?\})\s*$/;
        const jsonMatch = responseText.match(toolCallPattern);
        if (jsonMatch) {
            console.log(`[VIBEY][LLM_Utils] Found inline JSON pattern`);
            jsonContent = jsonMatch[1];
            console.log(`[VIBEY][LLM_Utils] Extracted JSON content (first 200 chars): ${jsonContent.substring(0, 200)}`);
        } else {
            console.log(`[VIBEY][LLM_Utils] No JSON pattern found - treating as plain text`);
        }
    }
    if (!jsonContent) {
        console.log(`[VIBEY][LLM_Utils] Returning as plain text response`);
        return { text: responseText };
    }
    try {
        const parsed = JSON.parse(jsonContent);
        console.log(`[VIBEY][LLM_Utils] Successfully parsed JSON:`, JSON.stringify(parsed, null, 2));
        return parsed;
    } catch (error: any) {
        console.error(`[VIBEY][LLM_Utils] JSON parse error: ${error.message}`);
        console.error(`[VIBEY][LLM_Utils] Failed to parse: ${jsonContent.substring(0, 200)}`);

        // Report parsing error in UI
        if (onUpdate) {
            onUpdate({
                type: 'error',
                message: `**JSON Parsing Error**

The LLM returned JSON that couldn't be parsed:

\`\`\`
${error.message}
\`\`\`

**Raw JSON content (first 500 chars):**
\`\`\`json
${jsonContent.substring(0, 500)}
\`\`\`

**Full LLM response (first 1000 chars):**
\`\`\`
${responseText.substring(0, 1000)}
\`\`\`

Falling back to treating this as plain text.`
            });
        }

        console.log(`[VIBEY][LLM_Utils] Falling back to plain text response`);
        return { text: responseText };
    }
}
