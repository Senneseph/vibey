"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextManager = void 0;
const fs = require("fs/promises");
class ContextManager {
    async resolveContext(items) {
        if (!items || items.length === 0)
            return '';
        let contextBlock = '\n\n<context>\n';
        for (const item of items) {
            try {
                // Determine if file is text or binary (basic check)
                // For MVP, assume everything is text/code.
                const content = await fs.readFile(item.path, 'utf-8');
                contextBlock += `<file path="${item.path}">\n${content}\n</file>\n`;
            }
            catch (e) {
                console.error(`Failed to read context file ${item.path}`, e);
                contextBlock += `<file path="${item.path}" error="true">Could not read file.</file>\n`;
            }
        }
        contextBlock += '</context>\n';
        return contextBlock;
    }
}
exports.ContextManager = ContextManager;
//# sourceMappingURL=context_manager.js.map