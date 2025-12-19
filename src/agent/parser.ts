import { ToolCall } from '../tools/schema';

export function parseToolCalls(response: string): ToolCall[] {
  // Strip leading 'json ' or ```json markers if present
  let cleaned = response.trim();
  if (cleaned.startsWith('json ')) {
    cleaned = cleaned.substring(5).trim();
  }
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7).split('```')[0].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
      return parsed.tool_calls;
    }
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.tool_calls) {
      return [parsed.tool_calls];
    }
    throw new Error('Expected tool_calls array');
  } catch (error) {
    throw new Error(`Failed to parse tool calls: ${error}`);
  }
}
