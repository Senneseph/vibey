// Error formatting and abort logic
export function formatError(error: any): string {
    if (!error) return 'Unknown error';
    
    // Handle OpenAI-compatible client errors specifically
    if (error.message && error.message.includes('OpenAI-Compatible API error')) {
        // Extract status code and message from the error
        const match = error.message.match(/OpenAI-Compatible API error: (.+?) \(status (\d+)\)/);
        if (match) {
            return `OpenAI API Error: ${match[1]} (Status ${match[2]}) - Check your API key and endpoint configuration`;
        }
        return error.message;
    }
    
    // Handle network errors from OpenAI-compatible client
    if (error.message && error.message.includes('Cannot connect to endpoint')) {
        return 'Network Error: Cannot connect to OpenAI endpoint. Check your baseUrl and API key configuration.';
    }
    
    // Handle JSON parsing errors
    if (error.message && error.message.includes('JSON')) {
        return 'Response Parsing Error: OpenAI server returned invalid JSON. The model may be overloaded or misconfigured.';
    }
    
    // Handle HTTP status errors
    if (error.message && error.message.includes('status')) {
        return `HTTP Error: OpenAI server returned status ${error.message}`;
    }
    
    // Handle AbortError
    if (error.name === 'AbortError') {
        return 'Request cancelled by user';
    }
    
    // Handle generic fetch errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return 'Fetch Failed: Network connection issue. Check your internet connection and OpenAI endpoint.';
    }
    
    // Fallback for other errors
    return error.message ? error.message : String(error);
}

export function handleAbort(controller: AbortController | null): void {
    if (controller) controller.abort();
}
