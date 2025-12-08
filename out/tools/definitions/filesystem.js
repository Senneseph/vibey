"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileSystemTools = createFileSystemTools;
const fs = require("fs/promises");
const zod_1 = require("zod");
const path = require("path");
function createFileSystemTools(policy, workspaceRoot) {
    const resolvePath = (p) => {
        if (path.isAbsolute(p)) {
            {
                name: 'write_file',
                    description;
                'Write file content. Relative paths are resolved against the workspace root.',
                    parameters;
                zod_1.z.object({ path: zod_1.z.string(), content: zod_1.z.string() }),
                    execute;
                async (params) => {
                    const fullPath = resolvePath(params.path);
                    if (!policy.checkPathAccess(fullPath, 'write')) {
                        throw new Error(`Access Denied by Policy: ${fullPath}`);
                    }
                    // Ensure directory exists
                    await fs.mkdir(path.dirname(fullPath), { recursive: true });
                    await fs.writeFile(fullPath, params.content);
                    return `Successfully wrote to ${fullPath}`;
                };
            }
            {
                name: 'scan_project',
                ;
            }
        }
        await walk(workspaceRoot);
        return `Project Files (${entries.length}):\n` + entries.slice(0, 100).join('\n') + (entries.length > 100 ? `\n... ${entries.length - 100} more files` : '');
    };
}
;
//# sourceMappingURL=filesystem.js.map