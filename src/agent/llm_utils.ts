// LLM communication and response parsing utilities
import { LLMProvider } from './types';
import { HistoryEntry } from './history_utils';

export async function callLLM(llm: LLMProvider, history: HistoryEntry[], signal: AbortSignal): Promise<{
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}> {
    return await llm.chat(history, signal);
}

/**
 * Result of JSON extraction attempt
 */
export interface JsonExtractionResult {
    success: boolean;
    json: string | null;
    error: string | null;
    method: 'fenced' | 'bracket-matching' | 'none';
    startIndex?: number;
    endIndex?: number;
}

/**
 * Extract a complete JSON object from text using bracket matching.
 * This handles nested objects and arrays correctly, unlike regex.
 *
 * @param text The text to search for JSON
 * @param startFrom Index to start searching from (optional)
 * @returns Extraction result with the JSON string or error details
 */
export function extractJsonWithBracketMatching(text: string, startFrom: number = 0): JsonExtractionResult {
    // Find the start of a JSON object that looks like a tool call
    // We look for patterns like {"thought" or {"tool_calls"
    const toolCallPattern = /\{\s*"(?:thought|tool_calls)/g;
    toolCallPattern.lastIndex = startFrom;

    const match = toolCallPattern.exec(text);
    if (!match) {
        return {
            success: false,
            json: null,
            error: 'No JSON object starting with "thought" or "tool_calls" found',
            method: 'bracket-matching'
        };
    }

    const startIndex = match.index;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
        const char = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }

        if (char === '"' && !escaped) {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (char === '{' || char === '[') {
            depth++;
        } else if (char === '}' || char === ']') {
            depth--;
            if (depth === 0) {
                endIndex = i;
                break;
            }
        }
    }

    if (endIndex === -1) {
        return {
            success: false,
            json: null,
            error: `Unclosed JSON object - started at index ${startIndex}, reached end of text with depth ${depth}`,
            method: 'bracket-matching',
            startIndex
        };
    }

    const jsonString = text.substring(startIndex, endIndex + 1);

    return {
        success: true,
        json: jsonString,
        error: null,
        method: 'bracket-matching',
        startIndex,
        endIndex
    };
}

/**
 * Parse the LLM response, extracting tool calls or returning plain text.
 * Uses multiple strategies:
 * 1. Fenced JSON blocks (```json ... ```)
 * 2. Bracket-matching for inline JSON
 * 3. Falls back to plain text if no JSON found
 *
 * @param responseText The raw LLM response text
 * @param onUpdate Callback for reporting parsing progress/errors
 * @returns Parsed response object with either tool_calls/thought or { text: string }
 */
export function parseLLMResponse(responseText: string, onUpdate?: (update: any) => void): any {
    console.log(`[VIBEY][LLM_Utils] Parsing LLM response (${responseText.length} chars)...`);

    let jsonContent: string | null = null;
    let extractionMethod: string = 'none';
    let extractionError: string | null = null;

    // Strategy 1: Parse fenced JSON block (```json ... ```)
    const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
    if (fencedMatch) {
        console.log(`[VIBEY][LLM_Utils] Found fenced JSON block`);
        jsonContent = fencedMatch[1].trim();
        extractionMethod = 'fenced';

        // Handle double 'json' prefix (some LLMs do this)
        if (jsonContent.startsWith('json')) {
            jsonContent = jsonContent.slice(4).trim();
        }
        console.log(`[VIBEY][LLM_Utils] Extracted JSON content (first 200 chars): ${jsonContent.substring(0, 200)}`);
    } else {
        // Strategy 2: Use bracket matching for inline JSON
        console.log(`[VIBEY][LLM_Utils] No fenced JSON block found, trying bracket matching`);
        const extraction = extractJsonWithBracketMatching(responseText);

        if (extraction.success && extraction.json) {
            console.log(`[VIBEY][LLM_Utils] Bracket matching found JSON at indices ${extraction.startIndex}-${extraction.endIndex}`);
            jsonContent = extraction.json;
            extractionMethod = 'bracket-matching';
            console.log(`[VIBEY][LLM_Utils] Extracted JSON content (first 200 chars): ${jsonContent.substring(0, 200)}`);
        } else {
            console.log(`[VIBEY][LLM_Utils] Bracket matching failed: ${extraction.error}`);
            extractionError = extraction.error;
            extractionMethod = 'none';
        }
    }

    // No JSON found - treat as plain text
    if (!jsonContent) {
        console.log(`[VIBEY][LLM_Utils] No JSON pattern found - treating as plain text`);
        console.log(`[VIBEY][LLM_Utils] Extraction method attempted: ${extractionMethod}`);
        if (extractionError) {
            console.log(`[VIBEY][LLM_Utils] Extraction error: ${extractionError}`);
        }
         
        // Handle empty response case
        if (!responseText || responseText.trim() === '') {
            console.warn(`[VIBEY][LLM_Utils] ⚠️ Empty response received from LLM`);
             
            // Report detailed error in UI
            if (onUpdate) {
                onUpdate({
                    type: 'error',
                    message: `**LLM Empty Response Error**

The LLM returned an empty response. This may indicate:
1. The LLM failed to generate a response
2. The response was truncated or incomplete
3. There was a connection or parsing issue

**Response length**: 0 characters
**Extraction method**: ${extractionMethod}
${extractionError ? '**Extraction error**: ' + extractionError : ''}

This is typically a temporary issue. Please try again or check your LLM connection.`
                });
            }
             
            // Return a special marker to indicate empty response for retry logic
            return { text: responseText, isEmptyResponse: true };
        }
         
        return { text: responseText };
    }

    // Try to parse the extracted JSON
    try {
        const parsed = JSON.parse(jsonContent);
        console.log(`[VIBEY][LLM_Utils] ✅ Successfully parsed JSON via ${extractionMethod}`);
        console.log(`[VIBEY][LLM_Utils] Parsed structure:`, JSON.stringify(parsed, null, 2).substring(0, 500));
        return parsed;
    } catch (error: any) {
        console.error(`[VIBEY][LLM_Utils] ❌ JSON parse error: ${error.message}`);
        console.error(`[VIBEY][LLM_Utils] Extraction method was: ${extractionMethod}`);
        console.error(`[VIBEY][LLM_Utils] Failed to parse (first 500 chars): ${jsonContent.substring(0, 500)}`);

        // Report detailed parsing error in UI
        if (onUpdate) {
            onUpdate({
                type: 'error',
                message: `**JSON Parsing Error**

The LLM returned JSON that couldn't be parsed.

**Extraction Method**: ${extractionMethod}

**Parse Error**:
\`\`\`
${error.message}
\`\`\`

**Extracted JSON (first 500 chars)**:
\`\`\`json
${jsonContent.substring(0, 500)}
\`\`\`

**Full LLM response (first 1000 chars)**:
\`\`\`
${responseText.substring(0, 1000)}
\`\`\`

This may indicate:
1. The LLM produced malformed JSON
2. There's an unescaped character or encoding issue
3. The JSON is incomplete (truncated response)

Falling back to treating this as plain text.`
            });
        }

        console.log(`[VIBEY][LLM_Utils] Falling back to plain text response`);
        return { text: responseText };
    }
}
