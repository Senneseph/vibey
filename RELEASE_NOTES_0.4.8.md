# Vibey v0.4.8 Release Notes

## Overview
v0.4.8 adds **comprehensive end-to-end logging and diagnostics** to solve the critical "fetch failed" timeout issue that users experienced in v0.4.7. This release provides complete visibility into what's being sent to the LLM, where requests are slow, and exactly why they fail.

## Critical Improvements

### 1. **LLM Request Details Visibility**
- **Before**: Users had no idea what was being sent to Ollama or how large the payload was
- **After**: Chat panel now shows expandable `🔌 LLM Request Sent` panel with:
  - Model name
  - Message count in conversation history
  - Payload size in bytes
  - Estimated token count
  - Time until request was sent

### 2. **Detailed Error Information**
- **Before**: "fetch failed" errors with no context about what went wrong
- **After**: Expandable `❌ LLM Error` panel in chat showing:
  - Exact error message
  - Source module and function
  - Duration before failure
  - Troubleshooting steps:
    - Check Ollama is running
    - Verify connection URL
    - Check browser console for network errors
    - Check Extension Host output for detailed logs

### 3. **Comprehensive Logging Across Pipeline**

#### **Ollama Client** (`src/llm/ollama.ts`)
- Logs before fetch: model, message count, payload size, estimated tokens
- Logs after fetch: status code, response tokens, duration in milliseconds
- Logs on error: full error details, duration at failure, stack trace

#### **Orchestrator** (`src/agent/orchestrator.ts`)
- Logs context resolution time (identifies slow file loading)
- Logs message assembly (shows history size, token estimates)
- Logs before each LLM call (sends request details to chat panel)
- Logs each reasoning turn

#### **Context Manager** (`src/agent/context_manager.ts`)
- Per-file logging: name, character count, read duration
- Helps identify if slow context items (large files) are causing bottlenecks
- Total context resolution time

#### **Chat Panel** (`src/ui/ChatPanel.ts`)
- Enhanced error reporting with stack traces
- Sends 'llmError' messages to webview with error details
- Includes source module and duration information

### 4. **Webview Error Handling** (`src/ui/media/main.js`)
- Global error handler captures unhandled exceptions
- Promise rejection handler for async errors
- Sends error details to extension with source information
- Message handlers for 'llmRequest' and 'llmError' types

### 5. **UI Message Renderers** (`src/ui/media/message_renderer.js`)
- `llmRequest` handler: Expandable panel showing request details
- `llmError` handler: Expandable error panel with troubleshooting guidance
- Both include timing information for debugging performance issues

## How to Debug "Fetch Failed" Issues

### 1. **Check Extension Host Output**
- View → Output → Select "Vibey" from dropdown
- Look for `[VIBEY][...]` prefixed log messages showing:
  - Context resolution time
  - Payload size before sending
  - Fetch initiation and completion
  - Error messages with timestamps

### 2. **Check Chat Panel for Request Details**
- Expandable `🔌 LLM Request Sent` panel shows what was sent
- If panel doesn't appear, error happened before fetch
- Check `[VIBEY][ContextManager]` logs for slow context loading

### 3. **Check Chat Panel for Error Details**
- Expandable `❌ LLM Error` panel shows exact failure point
- Troubleshooting steps guide you to fix the issue
- Follow "Check Extension Host output" for detailed logs

### 4. **Correlate Timing Information**
- Look for bottlenecks:
  - `Context resolution took Xms` - file I/O issue if > 1000ms
  - `Payload size: Xbytes` - context too large if > 50000 bytes
  - `Fetch duration: Xms` - network issue if very long
  - Request never appears - error before sending

## Technical Details

### Logging Format
All logs use format: `[VIBEY][ModuleName] Message with context`
- Makes it easy to find logs in Extension Host output
- Can search for specific module or all VIBEY logs

### Token Estimation
- Rough estimate: 1 token ≈ 4 characters
- Calculated as: `Math.ceil(characterCount / 4)`
- Provides quick sense of prompt size

### Message Flow
```
User sends message
  ↓
ChatPanel.handleMessage()
  ↓
Orchestrator.chat(userMessage, contextItems, onUpdate)
  ↓
ContextManager.getContextForTask() - logs per-file timing
  ↓
Orchestrator logs context resolution time
  ↓
Orchestrator sends 'llmRequest' to ChatPanel
  ↓
ChatPanel sends 'llmRequest' to webview
  ↓
Message renderer displays in chat panel
  ↓
Orchestrator calls LLM (Ollama client logs request/response)
  ↓
Orchestrator processes response
```

## Testing the Improvements

### Test Scenario 1: Successful Request
1. Open Vibey Chat panel
2. Send a short message
3. Look for `🔌 LLM Request Sent` panel in chat
4. Check Extension Host output for timing logs
5. Verify payload size is reasonable (< 50000 bytes for typical context)

### Test Scenario 2: Slow Request
1. Add large context files (10+ files, 1000+ lines each)
2. Send a message
3. Check `🔌 LLM Request Sent` panel - note the payload size
4. Check Extension Host output:
   - Look for `[VIBEY][ContextManager]` logs showing per-file read times
   - If any file takes > 500ms, investigate that file
5. If overall request is slow:
   - High payload size → context is large, consider reducing
   - Slow context resolution → check file I/O performance

### Test Scenario 3: Connection Failed
1. Stop Ollama server
2. Send a message in Vibey
3. Look for `❌ LLM Error` expandable panel in chat
4. Click troubleshooting link "Check Ollama is running"
5. Start Ollama and retry

## Performance Targets

### Typical Timings (for reference)
- Context resolution: 50-200ms (per-file logging helps identify slow files)
- Message composition: < 100ms
- Fetch request: 500ms-5s (depends on Ollama performance and model)
- Full turn: 1-10 seconds (varies with model and response length)

If timings are significantly worse, check:
1. Extension Host output for bottlenecks
2. Ollama server performance
3. File size of context items
4. Network latency if Ollama is remote

## Changelog

### Added
- Comprehensive logging across entire LLM pipeline
- `🔌 LLM Request Sent` chat panel display showing request details
- `❌ LLM Error` chat panel display with troubleshooting steps
- Per-file timing in context manager
- Request duration tracking
- Token estimation at each stage
- Global error handler in webview with source information
- Promise rejection handler for async errors
- Detailed error messages with stack traces

### Improved
- Error reporting clarity (exact error message, source, duration)
- Visibility into message assembly process
- Timeout debugging (can now identify which stage is slow)
- Connection failure diagnosis (clearer error messages and steps)

### Fixed
- Users can now see what's being sent to Ollama
- Users can identify slow stages in request pipeline
- Users have clear troubleshooting steps when things fail

## Backward Compatibility
✅ Fully backward compatible with v0.4.7
- All new logging is additive
- No breaking changes to API or configuration
- Existing workflows unaffected

## Known Limitations
- Token estimation is approximate (actual tokens depend on LLM tokenizer)
- Payload size shown in UI may differ from actual HTTP payload (JSON encoding, compression)
- Per-file timing useful mainly for context resolution debugging

## Next Steps
1. Install v0.4.8
2. Try your typical workflow
3. If you encounter "fetch failed" or timeouts:
   - Check Extension Host output for timing logs
   - Note the payload size and context resolution time
   - Use troubleshooting steps in error panel
4. Report any issues with:
   - Extension Host output logs
   - Screenshot of error panel
   - Payload size and context items

---

**v0.4.8** - 2024
**Vibey: Chat with your code**
