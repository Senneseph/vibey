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
        // Check for JSON block with tool_calls
        const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) return false;
        
        try {
            const jsonStr = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonStr);
            return !!parsed.tool_calls;
        } catch (e) {
            return false;
        }
    }
}
