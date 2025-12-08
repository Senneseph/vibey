"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileSystemTools = createFileSystemTools;
const fs = require("fs/promises");
const zod_1 = require("zod");
function createFileSystemTools(policy) {
    return [
        {
            name: 'read_file',
            description: 'Read file content',
            parameters: zod_1.z.object({ path: zod_1.z.string() }),
            execute: async (params) => {
                if (!policy.checkPathAccess(params.path, 'read')) {
                    throw new Error('Access Denied by Policy');
                }
                return await fs.readFile(params.path, 'utf-8');
            }
        },
        {
            name: 'write_file',
            description: 'Write file content',
            parameters: zod_1.z.object({ path: zod_1.z.string(), content: zod_1.z.string() }),
            execute: async (params) => {
                if (!policy.checkPathAccess(params.path, 'write')) {
                    throw new Error('Access Denied by Policy');
                }
                await fs.writeFile(params.path, params.content);
                return `Successfully wrote to ${params.path}`;
            }
        }
    ];
}
//# sourceMappingURL=filesystem.js.map