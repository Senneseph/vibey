"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFileSystemTools = createFileSystemTools;
const fs = __importStar(require("fs/promises"));
const zod_1 = require("zod");
const path = __importStar(require("path"));
function createFileSystemTools(policy, workspaceRoot) {
    const resolvePath = (p) => {
        if (path.isAbsolute(p)) {
            return p;
        }
        return path.join(workspaceRoot, p);
    };
    return [
        {
            name: 'read_file',
            description: 'Read file content. Relative paths are resolved against the workspace root.',
            parameters: zod_1.z.object({ path: zod_1.z.string() }),
            execute: async (params) => {
                const fullPath = resolvePath(params.path);
                if (!policy.checkPathAccess(fullPath, 'read')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                return await fs.readFile(fullPath, 'utf-8');
            }
        },
        {
            name: 'write_file',
            description: 'Write file content. Relative paths are resolved against the workspace root.',
            parameters: zod_1.z.object({ path: zod_1.z.string(), content: zod_1.z.string() }),
            execute: async (params) => {
                const fullPath = resolvePath(params.path);
                if (!policy.checkPathAccess(fullPath, 'write')) {
                    throw new Error(`Access Denied by Policy: ${fullPath}`);
                }
                // Ensure directory exists
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, params.content);
                return `Successfully wrote to ${fullPath}`;
            }
        },
        {
            name: 'scan_project',
            description: 'List all files in the workspace (excluding .git, node_modules, etc). Useful for understanding project structure.',
            parameters: zod_1.z.object({}),
            execute: async () => {
                // Simple recursive file walk respecting basic excludes
                const entries = [];
                async function walk(dir) {
                    const files = await fs.readdir(dir, { withFileTypes: true });
                    for (const file of files) {
                        const relative = path.relative(workspaceRoot, path.join(dir, file.name));
                        // Basic Excludes
                        if (file.name === '.git' || file.name === 'node_modules' || file.name === '.DS_Store' || file.name === 'out' || file.name === 'dist') {
                            if (file.isDirectory()) {
                                entries.push(relative + '/ (ignored)');
                            }
                            continue;
                        }
                        if (file.isDirectory()) {
                            await walk(path.join(dir, file.name));
                        }
                        else {
                            entries.push(relative);
                        }
                    }
                }
                await walk(workspaceRoot);
                return `Project Files (${entries.length}):\n` + entries.slice(0, 100).join('\n') + (entries.length > 100 ? `\n... ${entries.length - 100} more files` : '');
            }
        }
    ];
}
//# sourceMappingURL=filesystem.js.map