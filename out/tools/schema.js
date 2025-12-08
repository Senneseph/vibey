"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolResultSchema = exports.ToolCallSchema = void 0;
const zod_1 = require("zod");
exports.ToolCallSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    parameters: zod_1.z.record(zod_1.z.any())
});
exports.ToolResultSchema = zod_1.z.object({
    role: zod_1.z.literal('tool_result'),
    tool_call_id: zod_1.z.string(),
    status: zod_1.z.enum(['success', 'error']),
    output: zod_1.z.string(),
    error: zod_1.z.string().optional()
});
//# sourceMappingURL=schema.js.map