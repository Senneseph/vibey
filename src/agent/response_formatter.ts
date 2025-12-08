/**
 * Response Formatter for Vibey
 * Ensures proper response formatting based on context
 */

export class ResponseFormatter {
    
    /**
     * Format a response to ensure it's plain text when no tools are being used
     * @param responseText The raw response text from the LLM
     * @param hasToolCalls Whether the response contains tool calls
     * @returns Formatted response
     */
    static formatResponse(responseText: string, hasToolCalls: boolean = false): string {
        if (hasToolCalls) {
            // If there are tool calls, return as-is (should be JSON)
            return responseText;
        }
        
        // For plain text responses, ensure we don't return JSON blocks
        // Remove any JSON block formatting if present
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

        // Fallback: look for JSON object with tool_calls key
        const toolCallPattern = /\{\s*"(?:thought|tool_calls)"[\s\S]*\}/;
        const jsonMatch = responseText.match(toolCallPattern);

        if (!jsonMatch) return false;

        try {
            const parsed = JSON.parse(jsonMatch[0]);
            return !!parsed.tool_calls;
        } catch (e) {
            return false;
        }
    }
}
