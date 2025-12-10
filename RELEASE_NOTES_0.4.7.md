# Vibey v0.4.7 - Enhanced Debugging & Feedback Release

## Summary of Changes

This release focuses on making Vibey's reasoning and LLM interactions more transparent, so you can understand what's happening when processing your requests—especially during GPU usage and timeouts.

## Key Improvements

### 1. **Simplified System Prompt** ✅
- **Before**: ~2,200 tokens of complex reasoning instructions (context caching, checkpointing, master context)
- **After**: ~600 tokens of clear, essential instructions
- **Impact**: ~1,600 fewer tokens per request = faster responses, lower token usage

**What was removed:**
- Unused "Context Caching" instructions
- Unused "Checkpointing" feature descriptions
- Unused "Master Context Management" explanations
- Unused "Task Progress Tracking" guidance
- Verbose "Enhanced Reasoning Behavior" section

**What remains:**
- Core autonomous behavior (read, plan, execute)
- Tool definitions
- Response format
- Key rules

### 2. **Context Visibility** 🔍
When you add files to your request, Vibey now displays:
- **Expandable panel** showing which files were added
- **Token estimate** for the context block (~4 characters = 1 token)
- **Character count** for reference
- **File paths** to confirm correct files were added

Example:
```
📁 Context Added (~2,048 tokens)
  • orchestrator.ts (src/agent/orchestrator.ts)
  • chat_manager.js (src/ui/media/chat_manager.js)
2,048 characters
```

### 3. **Token Usage Reporting** 📊
At the end of each request:
```
📊 Token Usage: 3,072 sent, 1,024 received
```

Shows:
- **Tokens sent**: Your input + context + conversation history
- **Tokens received**: Vibey's response

Helps you understand:
- How much context impacts token usage
- If the model is generating verbose responses
- When to reduce input size

### 4. **Enhanced Tool Execution Feedback** 🛠️
Tool calls now clearly show:
- Status icon (⏳ running → ✅ success or ❌ error)
- Tool name and summary
- Expandable parameters
- Expandable results
- Real-time updates as tools execute

### 5. **Clear Thinking Progress** 🤔
Shows each stage of reasoning:
- `Analyzing request...` - Reading your input
- `Turn N: Reasoning...` - Multi-turn thinking
- `[Tool execution]` - Running tools with results
- Final response delivery

## Why These Changes?

### The Problem
You reported that requests seemed to timeout while GPU was being used, but without visibility:
- You didn't know what context was sent to the LLM
- You didn't know how many tokens were consumed
- You couldn't tell if the reasoning was too complex
- You couldn't see what tools were executing

### The Solution
**Transparency at every step:**

1. **Before sending to LLM**: See exact context files and token count
2. **During processing**: See what Vibey is thinking and which tools it's using
3. **After completion**: See total token usage and understand the cost

This lets you:
- ✅ Debug timeout issues by checking token usage
- ✅ Optimize requests by monitoring context size
- ✅ Understand GPU usage by seeing tool execution
- ✅ Make informed decisions about request complexity

## Technical Changes

### Modified Files
- `src/agent/orchestrator.ts`
  - Simplified system prompt (removed ~1,600 tokens of unused instructions)
  - Added context reporting via `onUpdate({ type: 'contextAdded', ... })`
  
- `src/ui/media/message_renderer.js`
  - Added handler for `contextAdded` update type
  - Displays context files, token estimate, and character count in expandable panel
  - Added token usage display

### Version Bump
- From 0.4.5 to 0.4.7
- Includes all previous fixes (history loading, microphone removal, etc.)

## How to Use

### Monitoring Token Usage
1. Make a request with context files
2. Look for the "📁 Context Added" panel - confirms files were added
3. Wait for response completion
4. Check "📊 Token Usage" to see actual consumption

### Debugging Slow Requests
- If a request hangs, check the context size in the expandable panel
- If token count is very high (>10K sent), consider splitting into multiple requests
- If you see stuck tools (⏳ not completing), that might be the GPU bottleneck

### Optimizing Future Requests
- Keep context focused - only include relevant files
- Monitor which files consume the most tokens
- Split large tasks into smaller requests if token count gets high

## Testing Checklist

- [x] Extension compiles without errors
- [x] Extension packages successfully (493 KB VSIX)
- [x] Simplified system prompt reduces tokens
- [x] Context tracking reports correctly
- [x] Token usage displays at end of request
- [x] Tool execution shows in real-time
- [x] Chat history loads correctly
- [x] Microphone removed (no button, no handlers)
- [x] All debug logging in place for troubleshooting

## Next Steps

You can now:
1. Reload the extension in VS Code
2. Make a request with some context files
3. Watch the chat panel for the new feedback
4. Monitor token usage to understand GPU impact

If requests still timeout:
- Check the context size (should be under 8K tokens)
- Look at tool execution logs
- Consider breaking large tasks into smaller steps
- Open Webview Developer Tools (F1 → "Developer: Open Webview Developer Tools") to see browser console for any JS errors

## Release Notes

**Vibey v0.4.7**
- ✨ NEW: Context visibility with token estimates
- ✨ NEW: Token usage reporting (sent vs. received)
- 📉 IMPROVED: Simplified system prompt (-1,600 tokens per request)
- 🐛 FIXED: Previous history loading and microphone issues
- 📖 ADDED: Enhanced debugging documentation

