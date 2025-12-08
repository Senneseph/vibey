
import { z } from 'zod';

export const ToolCallSchema = z.object({
    id: z.string(),
    name: z.string(),
    parameters: z.record(z.any())
});

export const ToolResultSchema = z.object({
    role: z.literal('tool_result'),
    tool_call_id: z.string(),
    status: z.enum(['success', 'error']),
    output: z.string(),
    error: z.string().optional()
});

export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: z.ZodType<any>;
    execute: (params: any, context: any) => Promise<string>;
    requireApproval?: boolean;
}
