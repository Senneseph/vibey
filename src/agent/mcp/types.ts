/**
 * MCP (Model Context Protocol) type definitions for Vibey
 */

import { z } from 'zod';

/** Configuration for an MCP server */
export interface McpServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    /** Optional timeout in ms for server startup */
    timeout?: number;
    /** Whether to auto-reconnect on disconnect */
    autoReconnect?: boolean;
}

/** Connection status of an MCP server */
export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/** Runtime state of an MCP server connection */
export interface McpServerState {
    name: string;
    config: McpServerConfig;
    status: McpConnectionStatus;
    error?: string;
    connectedAt?: number;
    toolCount: number;
    resourceCount: number;
    promptCount: number;
    /** Tool names registered from this server (for cleanup) */
    registeredTools: string[];
}

/** MCP Resource (read-only data sources) */
export interface McpResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

/** MCP Prompt template */
export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
    name: string;
    description?: string;
    required?: boolean;
}

/** Event types for MCP service */
export type McpEventType = 
    | 'server-connected'
    | 'server-disconnected'
    | 'server-error'
    | 'tools-updated'
    | 'resources-updated'
    | 'prompts-updated';

export interface McpEvent {
    type: McpEventType;
    serverName: string;
    data?: any;
}

/** Listener callback for MCP events */
export type McpEventListener = (event: McpEvent) => void;

/** 
 * Helper to convert JSON Schema to Zod schema
 * Supports basic types: string, number, boolean, object, array
 */
export function jsonSchemaToZod(schema: any): z.ZodType<any> {
    if (!schema || typeof schema !== 'object') {
        return z.any();
    }

    const type = schema.type;

    switch (type) {
        case 'string':
            let strSchema = z.string();
            if (schema.enum) {
                return z.enum(schema.enum as [string, ...string[]]);
            }
            return strSchema;

        case 'number':
        case 'integer':
            let numSchema = z.number();
            if (type === 'integer') {
                numSchema = numSchema.int();
            }
            return numSchema;

        case 'boolean':
            return z.boolean();

        case 'array':
            if (schema.items) {
                return z.array(jsonSchemaToZod(schema.items));
            }
            return z.array(z.any());

        case 'object':
            if (schema.properties) {
                const shape: Record<string, z.ZodType<any>> = {};
                const required = new Set(schema.required || []);

                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    let propZod = jsonSchemaToZod(propSchema);
                    if (!required.has(key)) {
                        propZod = propZod.optional();
                    }
                    shape[key] = propZod;
                }

                if (schema.additionalProperties !== false) {
                    return z.object(shape).passthrough();
                }
                return z.object(shape);
            }
            return z.object({}).passthrough();

        default:
            // For union types or unknown, use passthrough
            return z.any();
    }
}

