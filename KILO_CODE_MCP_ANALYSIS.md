# Kilo Code MCP Implementation Analysis

## Overview

After analyzing Kilo Code's documentation and implementation, here's how they handle MCP server launching and management.

## Key Differences from Vibey's Approach

### 1. **Configuration Structure**

**Kilo Code** uses a two-tier configuration system:
- **Global Config**: `mcp_settings.json` (VS Code settings)
- **Project Config**: `.kilocode/mcp.json` (project root)

**Vibey** uses:
- VS Code settings: `vibey.mcpServers`
- Built-in servers are hardcoded in the service

### 2. **Server Spawning**

**Kilo Code** spawns servers using:
```json
{
  "mcpServers": {
    "server-name": {
      "command": "node",
      "args": ["/path/to/server.js"],
      "env": {
        "API_KEY": "value"
      },
      "alwaysAllow": ["tool1", "tool2"],
      "disabled": false
    }
  }
}
```

**Vibey** has a similar structure but:
- Doesn't have `alwaysAllow` field
- Doesn't have `disabled` field
- Has `autoReconnect` and `timeout` fields

### 3. **Transport Types**

**Kilo Code** supports 3 transport types:
1. **STDIO** (local servers via stdin/stdout)
2. **Streamable HTTP** (remote servers via HTTP)
3. **SSE** (deprecated, legacy remote servers)

**Vibey** currently supports:
- STDIO only (based on the code we've seen)

### 4. **Server Lifecycle Management**

**Kilo Code** provides UI controls for:
- ✅ Enable/Disable toggle per server
- 🔄 Restart individual servers
- 🗑️ Delete servers
- ⏱️ Network timeout configuration (30s - 5min)
- ✓ Auto-approve specific tools

**Vibey** has:
- Reload all servers
- Auto-reconnect on failure
- No per-server controls in UI

## Critical Insights for Vibey

### Issue 1: Server Initialization Timing

**Kilo Code's Approach**:
- Servers are configured in JSON files
- Extension reads config on activation
- Spawns servers as child processes
- Maintains persistent connections
- Provides UI feedback on server status

**Vibey's Issue**:
- Built-in servers are added in `reloadServers()`
- But servers aren't showing up in tests
- Likely issue: Extension activation order

### Issue 2: Configuration Loading

**Kilo Code**:
```typescript
// Loads from two sources:
// 1. Global: mcp_settings.json
// 2. Project: .kilocode/mcp.json
// Project config takes precedence
```

**Vibey**:
```typescript
// Loads from:
// 1. VS Code settings: vibey.mcpServers
// 2. Hardcoded built-ins in getBuiltInOpenSpecServerConfig()
// 3. Marketplace servers (if enabled)
```

### Issue 3: Server State Management

**Kilo Code** likely uses:
- Immediate state registration when config is loaded
- Async connection attempts don't block state visibility
- UI shows "connecting", "connected", "error" states

**Vibey** (our fix):
- ✅ We added pre-population of server states
- ✅ States created before async connections
- ❓ But servers still not showing up - suggests config isn't being loaded

## Potential Root Cause in Vibey

Based on Kilo Code's approach, the issue is likely:

### Hypothesis 1: Extension Activation Order
```typescript
// In extension.ts, the order might be:
1. Create MCP service
2. Register MCP tools  // <-- This might be running BEFORE servers are loaded
3. Initialize MCP service (async)
```

**Fix**: Ensure MCP tools are registered AFTER `mcpService.initialize()` completes.

### Hypothesis 2: Configuration Not Being Read
```typescript
// In reloadServers():
const config = vscode.workspace.getConfiguration('vibey');
const servers = config.get<Record<string, McpServerConfig>>('mcpServers') || {};
```

**Issue**: If `getConfiguration()` is called before workspace is fully loaded, it might return empty.

**Fix**: Add defensive checks and logging to verify config is actually loaded.

### Hypothesis 3: Built-in Servers Not Being Added
```typescript
// The logic adds built-in servers ONLY if:
if (!disableOpenSpec && !configuredNames.has(builtInServerName)) {
    servers[builtInServerName] = this.getBuiltInOpenSpecServerConfig();
}
```

**Issue**: If `configuredNames` already has these names (from a previous run?), they won't be added.

**Fix**: Check if `configuredNames` is being polluted.

## Recommended Changes for Vibey

### 1. Add Explicit Initialization Logging
```typescript
console.log('[MCP] Extension activation starting...');
console.log('[MCP] Workspace folders:', vscode.workspace.workspaceFolders);
console.log('[MCP] Configuration available:', vscode.workspace.getConfiguration('vibey'));
```

### 2. Ensure Proper Async Initialization
```typescript
// In extension.ts
export async function activate(context: vscode.ExtensionContext) {
    // ... other setup ...
    
    // Create MCP service
    const mcpService = new McpService(context);
    
    // WAIT for initialization to complete
    await mcpService.initialize();
    
    // THEN register MCP tools (they need server states to exist)
    const mcpTools = createMcpTools(mcpService);
    toolGateway.registerTools(mcpTools);
}
```

### 3. Add Server State Persistence Check
```typescript
// After pre-populating states, verify they're actually there:
console.log('[MCP] Server states after pre-population:', 
    Array.from(this.serverStates.keys()));
```

### 4. Check Extension Activation Event
```typescript
// In package.json, ensure activation events include:
"activationEvents": [
    "onStartupFinished",  // <-- Ensures workspace is loaded
    "onCommand:vibey.runFeatureTests"
]
```

## Next Steps for Debugging

1. **Check Extension Host logs** for the initialization sequence
2. **Verify workspace is loaded** before MCP service initializes
3. **Confirm built-in servers are being added** to the `servers` object
4. **Verify server states are being created** in the Map
5. **Check if `getServerStates()` is returning the Map correctly**

## Kilo Code's Success Factors

1. **Clear separation** between config loading and server spawning
2. **Immediate UI feedback** on server status
3. **Per-server controls** for debugging
4. **Two-tier config** allows project-specific overrides
5. **Explicit enable/disable** prevents accidental server starts

