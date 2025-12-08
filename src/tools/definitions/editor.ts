
import * as vscode from 'vscode';
import { z } from 'zod';
import { ToolDefinition } from '../schema';
import * as path from 'path';

export function createEditorTools(): ToolDefinition[] {
    return [
        {
            name: 'get_problems',
            description: 'Get diagnostics (problems) from the current workspace. Can be filtered by severity or file.',
            parameters: z.object({
                filepath: z.string().optional().describe('Filter by specific file path'),
                severity: z.enum(['error', 'warning', 'info', 'hint']).optional().describe('Filter by severity level. If omitted, returns all.')
            }),
            execute: async (params: { filepath?: string; severity?: string }) => {
                let diagnostics = vscode.languages.getDiagnostics();

                // Filter by file if provided
                if (params.filepath) {
                    const targetUri = vscode.Uri.file(params.filepath);
                    // getDiagnostics can take a Uri directly
                    diagnostics = vscode.languages.getDiagnostics(targetUri).map(d => [targetUri, [d]] as [vscode.Uri, vscode.Diagnostic[]]);
                }

                // Severity map
                const severityMap: Record<string, vscode.DiagnosticSeverity> = {
                    'error': vscode.DiagnosticSeverity.Error,
                    'warning': vscode.DiagnosticSeverity.Warning,
                    'info': vscode.DiagnosticSeverity.Information,
                    'hint': vscode.DiagnosticSeverity.Hint
                };

                const targetSeverity = params.severity ? severityMap[params.severity] : undefined;

                const results: any[] = [];

                for (const [uri, diags] of diagnostics) {
                    if (diags.length === 0) continue;

                    const relevantDiags = diags.filter(d => targetSeverity === undefined || d.severity === targetSeverity);

                    if (relevantDiags.length > 0) {
                        results.push({
                            file: vscode.workspace.asRelativePath(uri),
                            problems: relevantDiags.map(d => ({
                                message: d.message,
                                severity: vscode.DiagnosticSeverity[d.severity], // Returns string name
                                line: d.range.start.line + 1, // 1-indexed for humans
                                source: d.source,
                                code: typeof d.code === 'object' ? d.code.value : d.code
                            }))
                        });
                    }
                }

                if (results.length === 0) {
                    return 'No problems found matching criteria.';
                }

                return JSON.stringify(results, null, 2);
            }
        },
        {
            name: 'get_open_editors',
            description: 'List all currently visible text editors.',
            parameters: z.object({}),
            execute: async () => {
                const editors = vscode.window.visibleTextEditors;
                if (editors.length === 0) return 'No editors are currently visible.';

                return JSON.stringify(editors.map(e => ({
                    file: vscode.workspace.asRelativePath(e.document.uri),
                    language: e.document.languageId,
                    isDirty: e.document.isDirty,
                    active: e === vscode.window.activeTextEditor
                })), null, 2);
            }
        },
        {
            name: 'get_active_terminal',
            description: 'Get information about the currently active terminal.',
            parameters: z.object({}),
            execute: async () => {
                const terminal = vscode.window.activeTerminal;
                if (!terminal) {
                    return 'No terminal is currently active/focused.';
                }

                return JSON.stringify({
                    name: terminal.name,
                    processId: await terminal.processId, // This is a specific permission promise
                    state: terminal.state
                }, null, 2);
            }
        }
    ];
}
