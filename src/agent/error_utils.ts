// Error formatting and abort logic
export function formatError(error: any): string {
    return error && error.message ? error.message : String(error);
}

export function handleAbort(controller: AbortController | null): void {
    if (controller) controller.abort();
}
