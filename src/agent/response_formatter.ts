/**
 * Response Formatter for Vibey
 * Ensures proper response formatting based on context
 */

import { extractJsonWithBracketMatching } from './llm_utils';

export class ResponseFormatter {

    /**
     * Format a response to ensure it's plain text when no tools are being used
     * @param responseText The raw response text from the LLM
     * @param hasToolCalls Whether the response contains tool calls
     * @returns Formatted response
     */
    static formatResponse(responseText: string, hasToolCalls: boolean = false): string {
        if (hasToolCalls) {
            // If there are tool calls, validate and sanitize the JSON before returning
            try {
                // Attempt to parse as JSON object (handles both fenced and inline JSON)
                let parsed: any;

                // Check for fenced JSON block
                const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);
                if (fencedMatch) {
                    parsed = JSON.parse(fencedMatch[1].trim());
                } else {
                    // Use bracket matching for inline JSON (handles nested objects correctly)
                    const extraction = extractJsonWithBracketMatching(responseText);
                    if (extraction.success && extraction.json) {
                        parsed = JSON.parse(extraction.json);
                    } else {
                        throw new Error(`No valid JSON found: ${extraction.error}`);
                    }
                }

                // Validate that it's a proper tool call structure
                if (!parsed || typeof parsed !== 'object') {
                    throw new Error('Invalid tool call structure');
                }

                // Ensure it has at least one expected key (thought or tool_calls)
                if (!('thought' in parsed) && !('tool_calls' in parsed)) {
                    throw new Error('Missing required fields: thought or tool_calls');
                }

                // Return the sanitized, validated JSON
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                // If JSON is malformed, treat as plain text response
                console.warn('Malformed tool call JSON detected, falling back to plain text:', e);
                return responseText.replace(/```json[\r\n]+[\s\S]*?[\r\n]+```/g, '').trim();
            }
        }

        // For plain text responses, ensure we don't return JSON blocks
        const cleanText = responseText
            .replace(/```json\n/g, '')
            .replace(/```/g, '')
            .trim();

        return cleanText;
    }

    /**
     * Check if a response contains tool calls
     * @param responseText The response text to check
     * @returns boolean indicating if tool calls are present
     */
    static hasToolCalls(responseText: string): boolean {
        // Check for fenced JSON block first (handles both \n and \r\n)
        const fencedMatch = responseText.match(/```json[\r\n]+([\s\S]*?)[\r\n]+```/);

        if (fencedMatch) {
            try {
                const parsed = JSON.parse(fencedMatch[1].trim());
                return !!parsed.tool_calls;
            } catch (e) {
                return false;
            }
        }

        // Use bracket matching for inline JSON (handles nested objects correctly)
        const extraction = extractJsonWithBracketMatching(responseText);
        if (!extraction.success || !extraction.json) {
            return false;
        }

        try {
            const parsed = JSON.parse(extraction.json);
            return !!parsed.tool_calls;
        } catch (e) {
            return false;
        }
    }
}
