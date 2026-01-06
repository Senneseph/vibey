// Tool execution and result handling
import { ToolGateway } from '../tools/gateway';
import { ToolCall } from '../tools/schema';
import { HistoryEntry } from './history_utils';

export async function executeTool(tools: ToolGateway, call: ToolCall): Promise<any> {
    return await tools.executeTool(call);
}

export function handleToolResult(history: HistoryEntry[], result: any, call: ToolCall): void {
    // Create a structured tool result that will be visible in chat logs
    const toolResult = {
        role: 'tool_result',
        tool_call_id: call.id,
        tool_name: call.name,
        status: result.status || 'success',
        output: result.output || result.result || result,
        error: result.error || undefined
    };
    
    // Add to history in a format that will be visible in chat
    const toolMessage = `🔧 Tool Result: ${call.name}

${toolResult.status === 'success' ? '✅ Success' : '❌ Error'}

${toolResult.output ? `Output:\n${toolResult.output}` : ''}
${toolResult.error ? `Error:\n${toolResult.error}` : ''}`;
    
    history.push({
        role: 'tool',
        content: toolMessage
    });
    
    console.log(`[VIBEY][ToolUtils] Tool result added to chat: ${call.name} (${toolResult.status})`);
    console.log(`[VIBEY][ToolUtils] Tool message: ${toolMessage.substring(0, 200)}...`);
}
