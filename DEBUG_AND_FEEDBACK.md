# Enhanced Debugging and Feedback System

## Overview

Version 0.4.7 includes improvements to help you understand what's happening when Vibey processes your requests, especially when requests seem to be taking a long time or timing out.

## Key Improvements

### 1. Simplified System Prompt
- **Removed**: Extensive (and unused) context caching, checkpointing, and master context instructions that added 2KB+ of overhead
- **Impact**: Reduces token overhead by ~500-600 tokens per request
- **Result**: Faster LLM responses and lower token consumption

### 2. Context Visibility
When you add files to your request context, Vibey now shows:
- **List of files** added to the context
- **Token estimate** for the context (~ 4 characters = 1 token, rough estimate)
- **Character count** of the context block
- **Expandable details** to review the file list without cluttering the chat

Example display:
```
📁 Context Added (~4,096 tokens)
  - feature.ts (src/features/feature.ts)
  - handler.ts (src/handlers/handler.ts)
4,096 characters
```

### 3. Token Usage Feedback
At the end of each request, Vibey reports:
```
📊 Token Usage: 2,048 sent, 1,024 received
```

This shows:
- **Tokens sent**: Total tokens in your message + context + conversation history
- **Tokens received**: Total tokens in Vibey's response

### 4. Thinking Progress
Vibey shows stage-by-stage thinking progress:
- `Analyzing request...` - Reading your message and context
- `Turn 2: Reasoning...` - Multi-turn reasoning (if applicable)
- Shows which tools are being executed and their results

### 5. Tool Execution Transparency
Each tool call shows:
- 🛠️ Tool name
- Summary of what's being done
- Expandable details with full parameters
- ✅/❌ Success/failure status
- Result summary (with expandable details)

## How to Use This Information

### Debugging Timeouts
If a request seems to hang:

1. **Check the context size**: If context shows >16K tokens, it's a large input
2. **Check token usage**: If tokens sent >> tokens received, the model might be thinking hard
3. **Check tool execution**: Look for tools that are taking a long time (typically indicated by a long pause with no new updates)

### Optimizing Requests
- Keep context focused: Only include relevant files
- Monitor token usage: If consistently >8K sent, consider splitting into multiple requests
- Use precise queries: More specific requests = faster responses

### Understanding Agent Behavior
The chat panel now clearly shows:
1. What context was added
2. What the agent is thinking about
3. What tools are being executed
4. How many tokens were used

This helps you understand:
- If the GPU is being used (will see tool execution or long thinking time)
- If the context is too large (will see high token count)
- If specific files are relevant (can see them in context list)

## Technical Details

### Context Token Estimation
- Uses simple heuristic: `tokens ≈ characters / 4`
- For accurate token counts, use your LLM's tokenizer
- Example: 4,096 characters ≈ 1,024 tokens

### System Prompt Reduction
Old system prompt: ~2,200 tokens
New system prompt: ~600 tokens
**Savings**: ~1,600 tokens per request

### Metrics Collection
Token usage data comes from your LLM provider (Ollama):
- Ollama reports `prompt_eval_count` and `eval_count` after each response
- These are displayed as "sent" and "received" respectively

## Example Session

```
You: Add this file to context
📎 → [file selected]

You: Help me understand this code
📁 Context Added (~2,048 tokens)
  - myfile.ts
2,048 characters

Vibey: [Thinking...]
🤔 Analyzing request...

[Tools execute...]

✅ read_file complete
Result: [expandable]

📊 Token Usage: 3,072 sent, 512 received
```

## Future Enhancements

Possible future improvements:
- Exact token counting (integrate with tokenizer)
- Performance metrics (tool execution time)
- Cost estimation (if you're paying per token)
- Context chunk recommendations
- Request optimization suggestions

