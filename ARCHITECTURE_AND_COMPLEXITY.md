# Architecture & Reasoning Complexity Analysis

## Current Architecture

### Layer 1: User Interface (Webview)
```
ChatPanel.ts (VS Code Extension)
    ↓
Webview HTML + CSS + JavaScript
    ├─ main.js (entry point)
    ├─ chat_manager.js (message handling)
    ├─ message_renderer.js (display updates)
    ├─ events.js (user interaction)
    └─ task_manager.js (task tracking)
```

### Layer 2: Agent Orchestration
```
AgentOrchestrator (main reasoning loop)
    ├─ System Prompt (600 tokens, clean)
    ├─ Context Manager (file reading, caching)
    ├─ LLM Interface (Ollama)
    ├─ Tool Gateway (read_file, write_file, etc.)
    └─ Reasoning Loop (256 max turns)
```

### Layer 3: LLM Integration
```
Ollama (Local LLM)
    ├─ Model: Qwen3-coder-32b (or configured)
    ├─ Streaming: Disabled (full response at once)
    └─ Token reporting: prompt_eval_count + eval_count
```

## Request Flow

```
1. USER INPUT
   ↓
2. WEBVIEW SENDS MESSAGE
   - Message text
   - Context files (optional)
   ↓
3. EXTENSION PROCESSES
   - Loads history from disk
   - Resolves context file contents
   - Estimates tokens (send count)
   ↓
4. REPORTS CONTEXT TO UI
   📁 Context Added (~X tokens)
   ↓
5. CALLS LLM (Orchestrator.chat)
   - Adds context to history
   - Enters reasoning loop
   - Max 256 turns
   ↓
6. REASONING LOOP
   - Send to LLM
   - Parse response (JSON or text)
   - If tool calls: execute tools
   - If final response: break loop
   ↓
7. REPORTS PROGRESS TO UI
   - Thinking updates ("Analyzing...")
   - Thought updates (reasoning)
   - Tool execution (start/end)
   ↓
8. RECEIVES LLM RESPONSE
   - Gets final text
   - Estimates tokens (receive count)
   ↓
9. REPORTS COMPLETION
   📊 Token Usage: X sent, Y received
   ↓
10. SAVES HISTORY & DISPLAYS
    - Message added to history
    - Saved to disk
    - Displayed in chat
```

## Reasoning Complexity - Before & After

### BEFORE (v0.4.5)
System prompt included:
- ✗ Context Caching instructions (200 tokens)
- ✗ Iterative Problem-Solving (300 tokens)
- ✗ Checkpointing (150 tokens)
- ✗ Master Context Management (400 tokens)
- ✗ Task Progress Tracking (250 tokens)
- ✗ Example workflows (300 tokens)
- ✗ Context Format explanations (200 tokens)

**Total system prompt: ~2,200 tokens**

Impact:
- Every request had to consume 2,200 tokens just for system prompt
- Agent was "told" about capabilities it didn't actually use
- LLM had to parse and understand unused instructions
- Extra cognitive overhead for the model

### AFTER (v0.4.7)
System prompt now includes ONLY:
- ✓ Core behavior (autonomous, DO IT approach)
- ✓ Tool definitions (what it CAN do)
- ✓ Response format (how to respond)
- ✓ Key rules (reading, minimal changes, etc.)

**Total system prompt: ~600 tokens**

Benefit:
- **1,600 tokens saved per request** (73% reduction)
- Clearer instructions = more consistent responses
- Faster processing = quicker responses
- Same capabilities, less overhead

## Why Requests Timeout

### Scenario: "GPU is being used but request times out"

Possible causes (in order of likelihood):

1. **Context Too Large** (Most Common)
   - Problem: You included many large files
   - Symptom: "Context Added (~16K tokens)" in UI
   - Solution: Reduce context, be more specific
   - Fix time: Model won't even start until it parses all input

2. **Complex Tool Sequences** (Second Most Common)
   - Problem: Agent is executing 10+ tools in sequence
   - Symptom: Multiple tool execution updates appearing
   - Solution: Ask for simpler tasks, break into steps
   - Fix time: Each tool adds 2-10 seconds

3. **Model Thinking Hard** (Legitimate)
   - Problem: Genuinely complex reasoning required
   - Symptom: "Turn N: Reasoning..." updates appear
   - Solution: Simplify request or upgrade GPU/model
   - Fix time: Model is actually working, let it finish

4. **Network Latency**
   - Problem: Ollama connection is slow
   - Symptom: UI shows updates but very slowly
   - Solution: Check network, restart Ollama
   - Fix time: Not really a fix, just slow

5. **True Timeout** (Rare, indicates bug)
   - Problem: Request genuinely stalled
   - Symptom: No updates for >30 seconds despite "Analyzing..."
   - Solution: Check browser console, restart extension
   - Fix time: This is a bug we need to find

## Debugging With New Feedback

### Scenario: Request hangs after 30 seconds

```
You: Analyze these files [adds 10 files]

📁 Context Added (~10,240 tokens) ← Check: Is this reasonable?
   If >15K, context is too large

Vibey: [Status shows "Analyzing..."]

[Wait 30 seconds - nothing updates]

🤔 Analyzing request...        ← Stuck here?
   ↓
   Open Webview Dev Tools
   → Console tab
   → Check for JS errors
   → Check browser network tab
```

### Scenario: Request takes 2 minutes

```
You: Analyze these files

📁 Context Added (~4,096 tokens) ← Reasonable

🤔 Analyzing request...

[Tools start executing]
  ✅ read_file (3s)
  ✅ read_file (2s)
  🛠️ run_command (⏳ running...)
  [5 seconds, 10 seconds, 20 seconds...]

→ This tool is slow (probably network/GPU)
→ Legitimate work being done
→ GPU IS being used (you can verify in system monitor)
→ Just slow at this moment
```

## Optimization Tips

### If Context Size is Problem
```
Context showing: 📁 Context Added (~15,000 tokens)

↓ DO THIS:

Instead of:
  read_file(src/app.ts)
  read_file(src/types.ts)
  read_file(src/utils.ts)
  read_file(src/helpers.ts)

Try:
  read_file(src/app.ts) only - the main file
  
Let Vibey ask for other files if needed
```

### If Tool Execution is Slow
```
If you see: 🛠️ run_command (⏳ 30 seconds)

This is ACTUAL GPU WORK
Not a bug
Just slow

You can:
1. Wait for it to complete ✓
2. Kill the request (button in UI)
3. Upgrade your GPU/Model
4. Ask simpler questions
```

### If Thinking is Complex
```
If you see: Turn 5: Reasoning...
            Turn 6: Reasoning...
            Turn 7: Reasoning...

This is the agent re-thinking (planning, adjusting)
Normal behavior
Not a problem

Means:
- Agent is being thorough ✓
- Probably found something tricky ✓
- Working to get it right ✓
```

## Token Usage Examples

### Simple Request
```
You: "Create a function that adds two numbers"

📁 Context Added: None
📊 Token Usage: 512 sent, 256 received

Analysis:
- Small input, no context
- Fast response expected
- Very efficient
```

### Medium Request with Context
```
You: "Fix the bug in this file" 
[Adds 1 file, 5KB]

📁 Context Added (~1,280 tokens)
📊 Token Usage: 2,048 sent, 512 received

Analysis:
- Input + context reasonable
- Response is moderate
- Normal performance
```

### Large Request with Heavy Context
```
You: "Refactor this codebase" 
[Adds 5 files, 50KB each]

📁 Context Added (~12,800 tokens)
📊 Token Usage: 14,000 sent, 2,048 received

Analysis:
- Large context
- Model had lots to read first
- Longer processing expected
- Response might be incomplete (too many tokens)
  → Might need to split into multiple requests
```

## Future Optimization Ideas

### Short-term (Easy)
- [ ] Exact token counting (using tokenizer library)
- [ ] Per-file token display
- [ ] Tool execution timing
- [ ] Estimated time remaining

### Medium-term (Moderate)
- [ ] Smart context pruning (remove unused files)
- [ ] Request queueing with priority
- [ ] Token limit warnings
- [ ] Automatic context splitting

### Long-term (Complex)
- [ ] Streaming responses (show results as they come)
- [ ] Parallel tool execution
- [ ] Model selection based on task complexity
- [ ] Cost estimation per request

