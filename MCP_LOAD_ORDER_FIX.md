# MCP Server Load Order and Awareness Fix

## Issues Identified

### Issue 1: Race Condition in MCP Server Initialization
**Problem**: The test suite was seeing 0 MCP servers because server states were only populated during the async `connectToServer()` call. If tests ran before connections completed, `getServerStates()` returned an empty array.

**Root Cause**: 
- `reloadServers()` built the server configuration list
- Server states were only created inside `connectToServer()` (async)
- Tests could run between these two steps, seeing no servers

**Fix**: Pre-populate server states synchronously before attempting async connections
- Added a loop in `reloadServers()` that creates initial server states with `status: 'connecting'` immediately
- This ensures `getServerStates()` returns configured servers even if connections are still pending
- Tests now see servers immediately, even if they're still connecting

**File**: `src/agent/mcp/mcp_service.ts` (lines 397-408)

### Issue 2: No MCP Server Awareness Tool
**Problem**: When asked "What MCP servers are available to you?", the agent had no built-in tool to query MCP server status. It would try to examine workspace files instead.

**Root Cause**: 
- MCP servers register their tools (e.g., `openspec_*`, `filesystem_*`) with the agent
- But there was no tool to query the MCP servers themselves
- The agent couldn't introspect its own MCP server configuration

**Fix**: Created new MCP management tools
- `get_mcp_servers`: Query available MCP servers, their status, and tool counts
- `list_mcp_tools`: List all tools from MCP servers, optionally filtered by server
- `get_mcp_resources`: Get resources exposed by MCP servers
- `get_mcp_prompts`: Get prompts exposed by MCP servers

**Files**: 
- `src/tools/definitions/mcp.ts` (new file)
- `src/extension.ts` (registered tools at lines 80-83)

### Issue 3: Test Suite Wait Logic
**Problem**: The test suite only waited 5 seconds and didn't provide good diagnostics about what went wrong.

**Fix**: Improved wait logic and diagnostics
- Increased timeout from 5 to 10 seconds
- Added stability detection (waits for server count to stabilize)
- Returns diagnostic information about the wait result
- Enhanced error messages with detailed diagnostics

**File**: `src/agent/testing/test_runner.ts` (lines 724-792)

## Changes Summary

### Modified Files
1. **src/agent/mcp/mcp_service.ts**
   - Pre-populate server states before async connections
   - Ensures tests see configured servers immediately

2. **src/extension.ts**
   - Import `createMcpTools`
   - Register MCP management tools after MCP service creation

3. **src/agent/testing/test_runner.ts**
   - Enhanced `waitForMCPServers()` with better logic and diagnostics
   - Improved test result messages with detailed information

### New Files
1. **src/tools/definitions/mcp.ts**
   - New tool definitions for MCP server management
   - 4 tools: `get_mcp_servers`, `list_mcp_tools`, `get_mcp_resources`, `get_mcp_prompts`

## Testing

To verify the fixes:

1. **Run Feature Tests**: Execute the "Run Feature Tests" command
   - Should now see MCP servers in the Configuration Check
   - Should show detailed diagnostics about server states

2. **Ask About MCP Servers**: In a chat, ask "What MCP servers are available to you?"
   - Agent should use `get_mcp_servers` tool
   - Should get immediate response without examining workspace files

3. **Check Tool Availability**: Ask "What tools do you have from MCP servers?"
   - Agent should use `list_mcp_tools` tool
   - Should list all tools grouped by server

## Expected Behavior

### Before Fix
- Test suite: "No MCP servers configured" (❌ FAILED)
- Agent query: "Thinking: I need to examine workspace files..." (slow, indirect)

### After Fix
- Test suite: "Found 2 MCP server(s): 2 connected, 0 pending" (✅ PASSED)
- Agent query: Uses `get_mcp_servers` tool immediately (fast, direct)

## Technical Details

### Server State Lifecycle
1. **Configuration Phase**: Servers are read from config + built-ins added
2. **Pre-registration Phase** (NEW): Server states created with `status: 'connecting'`
3. **Connection Phase**: Async connections attempted, states updated to 'connected' or 'error'
4. **Tool Registration Phase**: Tools from connected servers registered with gateway

### Tool Registration Order
1. Built-in tools (filesystem, patch, tasks, terminal, editor, search)
2. **MCP management tools** (NEW - allows agent to query MCP servers)
3. MCP service initialization
4. MCP server tools (from connected servers)

This ensures the agent always has tools to query MCP server status, even before MCP servers connect.

