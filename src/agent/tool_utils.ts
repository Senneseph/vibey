// Tool execution and result handling
import { ToolGateway } from '../tools/gateway';
import { ToolCall } from '../tools/schema';
import { HistoryEntry } from './history_utils';

export async function executeTool(tools: ToolGateway, call: ToolCall): Promise<any> {
    return await tools.executeTool(call);
}

export function handleToolResult(history: HistoryEntry[], result: any, call: ToolCall): void {
    history.push({
        role: 'tool',
        content: JSON.stringify({
            role: 'tool_result',
            tool_call_id: call.id,
            status: result.status || 'success',
            result: result.result || result,
            error: result.error || undefined
        })
    });
}
