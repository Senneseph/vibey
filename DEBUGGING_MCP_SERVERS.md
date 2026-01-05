# Debugging MCP Server Initialization

## Current Status

✅ **Both MCP servers CAN start successfully** (verified with `node test-mcp-init.js`)
- OpenSpec server: Working
- Filesystem server: Working

❌ **But servers are NOT loading in VS Code extension**
- Test result shows: 0 servers configured, 0 servers available
- This indicates the problem is in the VS Code extension initialization, not the servers themselves

## Key Findings from Kilo Code Analysis

After analyzing Kilo Code's MCP implementation (see `KILO_CODE_MCP_ANALYSIS.md`), I identified several potential issues:

1. **Extension Activation**: Kilo Code likely waits for workspace to be fully loaded
2. **Configuration Loading**: They use a two-tier config system (global + project)
3. **Server State Management**: Immediate state registration before async connections
4. **UI Feedback**: Clear status indicators for each server

## Most Likely Root Cause

The extension activation sequence in `src/extension.ts` shows:
```typescript
// Line 78: MCP Service created
mcpService = new McpService(gateway, context);

// Line 81-82: MCP tools registered
const mcpTools = createMcpTools(mcpService);
mcpTools.forEach(t => gateway.registerTool(t));

// Line 98-99: MCP service initialized (ASYNC)
await mcpService.initialize();
```

**The issue**: If the test runs BEFORE line 99 completes, it will see 0 servers!

## Changes Made

### 1. Enhanced Logging
Added comprehensive logging to `src/agent/mcp/mcp_service.ts`:
- Step-by-step initialization logging
- Detailed server configuration logging
- Error handling with stack traces

### 2. Fixed Environment Variable Issues
- Replaced `...process.env` spreads with filtered env objects
- Prevents undefined values from causing issues

### 3. Added Error Handling
- Wrapped marketplace loading in try-catch
- Prevents marketplace errors from blocking built-in servers

## Next Steps: PLEASE DO THIS

### Step 1: Reload VS Code Window
1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Type "Reload Window"
3. Press Enter

### Step 2: Check Extension Host Output
1. Open Output panel: `View > Output` (or `Ctrl+Shift+U`)
2. In the dropdown at the top-right, select **"Extension Host"**
3. Look for lines starting with `[MCP]`

### Step 3: Copy the MCP Logs
Please copy and paste ALL lines that start with `[MCP]` from the Extension Host output.

We're looking for:
```
[MCP] ========================================
[MCP] Initializing MCP Service...
[MCP] ========================================
[MCP] Step 1: Cleaning up stale servers...
[MCP] Step 1: Complete
[MCP] Step 2: Loading marketplace servers...
[MCP] Step 2: Complete
[MCP] Step 3: Reloading servers...
[MCP] Initial configured servers: [...]
[MCP] After marketplace servers: [...]
[MCP] Filesystem server - disabled: false, already configured: false
[MCP] Added built-in filesystem server
[MCP] OpenSpec server - disabled: false, already configured: false
[MCP] Added built-in OpenSpec server
[MCP] Final server list to load: [...]
[MCP] Pre-registered server state for: ...
[MCP] Step 3: Complete
[MCP] ========================================
[MCP] Initialization complete. Server states: [...]
[MCP] ========================================
```

## What We're Diagnosing

The logs will tell us:
1. **Is `reloadServers()` being called?**
2. **Are the built-in servers being added to the `servers` object?**
3. **Are server states being pre-registered?**
4. **Is there an exception being thrown somewhere?**

## Possible Issues

### Issue A: Configuration Override
If you see:
```
[MCP] Filesystem server - disabled: true
```
or
```
[MCP] OpenSpec server - disabled: true
```

**Solution**: Check your VS Code settings (`settings.json`) for:
- `vibey.disableFilesystemServer`
- `vibey.disableOpenSpecServer`

Set them to `false` or remove them.

### Issue B: Exception in reloadServers()
If you see:
```
[MCP] Step 3: Reloading servers...
[MCP] ❌ FATAL ERROR during initialization: ...
```

**Solution**: The error message will tell us what's wrong.

### Issue C: Servers Added But Not Registered
If you see:
```
[MCP] Final server list to load: ["filesystem-builtin", "openspec-builtin"]
```
But then:
```
[MCP] Initialization complete. Server states: []
```

**Solution**: There's a problem in the pre-registration loop or connection loop.

## Quick Test

After reloading, you can also run the feature tests again:
1. Press `Ctrl+Shift+P`
2. Type "Vibey: Run Feature Tests"
3. Check if MCP Configuration Check passes

## Files Modified

- `src/agent/mcp/mcp_service.ts` - Enhanced logging and error handling
- `src/tools/definitions/mcp.ts` - New MCP management tools
- `src/extension.ts` - Register MCP tools
- `src/agent/testing/test_runner.ts` - Better diagnostics

All changes compiled successfully with no TypeScript errors.

