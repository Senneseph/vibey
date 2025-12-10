# Vibey v0.4.9 Release Notes

## 🎯 Focus: Deep Visibility into "Fetch Failed" Timeouts

This release directly addresses the critical issue where requests hang for minutes and then fail with "fetch failed", with no visibility into what's happening. v0.4.9 provides **complete payload visibility and precise timing at every stage**.

## 🔍 Major Improvements

### 1. **See the Actual Message Text Being Sent**
- Chat panel now displays a **preview of the last message** being sent to Ollama
- Shows up to 300 characters of actual content (not just counts)
- Helps verify correct context and prompts are being used
- Located in expandable `🔌 LLM Request` panel in chat

### 2. **Real Duration Tracking (Fixed)**
- **v0.4.8 bug fixed**: Now shows ACTUAL fetch duration, not 0ms
- Two-stage reporting:
  1. Initial request shows `⏳ Sending...` with message details
  2. When response arrives, updates to `✅ Completed in XXXms`
- Helps identify if Ollama is slow or if network is hanging

### 3. **Detailed Message Content Logging**
- Extension Host output now logs **each message in the request**
  - Message role (user, assistant, tool)
  - Content preview (truncated if > 200 chars)
- Example output:
  ```
  [VIBEY][Ollama] Message 0 (user): "Here's my code file..."
  [VIBEY][Ollama] Message 1 (assistant): "I'll analyze this code..."
  [VIBEY][Ollama] Message 2 (user): "Can you add type hints?"
  ```

### 4. **Improved Network Error Diagnostics**
- Enhanced error messages in Extension Host output identify root causes:
  - Ollama server not running
  - Invalid connection URL
  - Network connectivity issues
  - CORS issues (if Ollama is remote)
- Error includes:
  - Elapsed time when error occurred
  - Full error stack trace
  - Error name and type

### 5. **Clearer Logging with Timestamps**
- Fetch request logged with ISO timestamp: `Initiating fetch request at 2024-12-09T22:35:15.123Z`
- Helps correlate with system events or network issues
- Multiple timing checkpoints:
  - Request initiation
  - Fetch completion (network round-trip)
  - Response parsing
  - Total elapsed time

## 📊 What You'll See Now

### In Chat Panel
```
🔌 LLM Request ✅ Completed in 3245ms (2415 tokens)
  Model: ollama
  Messages in history: 2
  Payload size: 9660 bytes
  Estimated tokens: ~2415
  Duration: 3245ms
  
  Last message preview:
  >>> Your actual message text appears here
  >>> Up to 300 characters shown
```

### In Extension Host Output
```
[VIBEY][Orchestrator] Sending LLM request - Messages: 2, Size: 9660 bytes, Est. tokens: 2415
[VIBEY][Ollama] Sending request to http://localhost:11434/api/chat
[VIBEY][Ollama] Model: Qwen3-coder-roo-config:latest
[VIBEY][Ollama] Message 0 (user): "Here's my code..."
[VIBEY][Ollama] Message 1 (assistant): "I analyzed it..."
[VIBEY][Ollama] Estimated payload tokens: ~2415
[VIBEY][Ollama] Payload size: 9660 bytes
[VIBEY][Ollama] Initiating fetch request at 2024-12-09T22:35:15.123Z...
[VIBEY][Ollama] Fetch completed in 3245ms with status 200
[VIBEY][Ollama] Response parsed in 3250ms
[VIBEY][Orchestrator] LLM response received in 3250ms
```

## 🐛 Debugging 5-Minute Timeout

If your request takes 5 minutes before failing:

### Step 1: Check Extension Host Output
Open `View → Output → Vibey (dropdown)` and look for:
- Does `[VIBEY][Ollama] Initiating fetch request` appear?
  - **No**: Error happened before fetch (context loading issue)
  - **Yes**: See step 2

### Step 2: Find the Bottleneck
Look at timestamps. Example:
```
[VIBEY][Ollama] Initiating fetch request at 22:35:15.200Z...
[VIBEY][Ollama] Fetch completed in 3245ms with status 200
```
- **Fetch completed quickly (3.2s)**: Ollama is fine, issue is elsewhere
- **Fetch hangs for minutes**: 
  - Ollama server frozen or overloaded
  - Network issue (latency, packet loss)
  - Check if Ollama process is running: `ps aux | grep ollama`

### Step 3: Check Message Content
If fetch takes 5 minutes, the message text might be huge:
1. Look at "Last message preview" in chat panel
2. Check `[VIBEY][Ollama] Payload size:` in logs
3. If > 50,000 bytes:
   - Context has too many files
   - A single file is very large
   - Try reducing context in your request

### Step 4: Network Diagnostics
If error says "fetch failed" after 5 minutes:
```
[VIBEY][Ollama] Error after 300000ms: fetch failed
[VIBEY][Ollama] Network/fetch error - possible causes:
  - Ollama server not running at http://localhost:11434
  - Invalid connection URL
  - Network connectivity issue
  - CORS issue if Ollama is remote
```

## 🔧 Technical Changes

### Modified Files
- **src/llm/ollama.ts**: Added message content logging, improved timestamps, enhanced error reporting
- **src/agent/orchestrator.ts**: Fixed duration tracking (now captures actual fetch time), added "Waiting for Ollama response" log
- **src/ui/media/message_renderer.js**: Added message preview, status indicator (⏳ Sending vs ✅ Completed)

### Key Improvements
1. **Message content logged** (with 200-char preview)
2. **Duration calculated AFTER fetch completes** (not before)
3. **Status updates** from "Sending..." to "Completed in XXXms"
4. **Error diagnostics** identify network vs Ollama vs context issues
5. **Timestamps** help correlate with external events

## 📈 Performance Insights

### Healthy Request Timing
```
Context loading:     0-500ms     (check [VIBEY][ContextManager] logs)
Message assembly:    < 100ms
Fetch to Ollama:     500ms-5s    (depends on model and prompt size)
Response parsing:    < 100ms
Total:               1-10 seconds (varies by model)
```

### If Request Exceeds 30 Seconds
1. Check Extension Host output for each stage timing
2. Identify slowest stage
3. Check message content preview (might have huge files)
4. Check Ollama server is not overloaded
5. Check network latency if Ollama is remote

## ✅ Testing v0.4.9

### Test 1: Normal Request
- Send a message with 2-3 context files
- Check chat panel shows `✅ Completed in XXXms`
- Check Extension Host shows fetch timing

### Test 2: Large Payload
- Add 10+ large files as context
- Send message
- Note the "Payload size: XXX bytes"
- Should see longer fetch time proportional to size

### Test 3: Connection Failure
- Stop Ollama server
- Send message
- Check error panel for diagnostic message
- Check Extension Host for network error details

### Test 4: Read Message Content
- Send message in chat
- Look at "Last message preview" in request panel
- Verify it matches your actual message
- Helps catch issues with context assembly

## 🎁 Bonus Features

### Message Content Preview
- Helps verify context is correct
- Shows first 300 chars of last message
- Useful for debugging "why did the model respond incorrectly"

### Fetch Status Indicator
- `⏳ Sending...` while request in flight
- `✅ Completed in Xms` when done
- Clear visual indication of request lifecycle

### Enhanced Error Messages
- Specific guidance for each error type
- Helps users self-diagnose network vs Ollama issues
- Reduces back-and-forth debugging

## 🚀 What's Next

v0.4.10 could add:
- Detailed breakdown of context items per file
- Message token count per message (not just total)
- Response time breakdown (fetch vs model thinking time)
- Payload size warnings when > 50KB
- Ollama server health check

## 🔄 Backward Compatibility
✅ Fully compatible with v0.4.8
- All logging is additive
- No breaking changes
- Optional enhancements only

---

**v0.4.9** - December 2024
**Vibey: Chat with your code**

*"I was stuck for 5 minutes wondering what was sent to the LLM. Now I can see exactly what, when, and how long it took!"*
