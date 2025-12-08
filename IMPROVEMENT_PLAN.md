# Vibey Codebase Improvement Plan

## Current State Analysis

The Vibey agent system already has several good foundations:

1. **History Management**: The `HistoryManager` properly persists chat history to both workspace state and file system
2. **Tool System**: Well-defined tool architecture with filesystem, patch, terminal, and task management tools
3. **Vectorization**: Basic vectorization utilities and in-memory vector database
4. **Task Management**: Task tracking system with status management
5. **Orchestration**: Agent orchestrator that handles LLM interaction and tool execution

## Key Improvements Based on User Suggestions

### 1. Preserve Thinking and Command Execution in Chat History

The current implementation already has good support for this in `AgentOrchestrator`:
- Tool calls are logged in the history
- Thoughts are emitted via onUpdate callback
- All actions are recorded in the conversation flow

However, we can enhance this by:
- Adding more detailed metadata to tool execution logs
- Improving the visualization of thinking processes in the UI

### 2. Show Parameters When Executing Tools

The current system shows parameters in the `onUpdate` callback but we can improve:
- Better formatting of tool parameters in the UI
- More detailed logging of tool execution
- Enhanced parameter validation feedback

### 3. Patch/Replace Style Implementation (Existing)

The `createPatchTools` function already provides `apply_patch` and `generate_patch` tools. This is exactly what was requested.

### 4. Text Vectorization and Database Exploration

The system has a basic vectorization utility and in-memory database, but we can enhance it:
- Implement better vectorization using proper embedding models
- Add support for external vector databases (Pinecone, Weaviate, etc.)
- Improve search and retrieval capabilities

## Implementation Plan

### Phase 1: Enhance History Management
- Improve parameter logging in tool execution
- Add more structured metadata to history entries
- Enhance UI visualization of thinking processes

### Phase 2: Improve Vectorization
- Replace simple hash-based vectors with proper embeddings
- Implement external vector database support
- Add vector search optimization

### Phase 3: Refine Tool Execution
- Add more detailed tool execution logging
- Improve parameter validation and error handling
- Add tool usage statistics

## Files to Modify

1. `src/agent/orchestrator.ts` - Enhance tool execution logging
2. `src/agent/vectorization.ts` - Improve vectorization implementation
3. `src/tools/definitions/patch.ts` - Enhance patch tools
4. `src/agent/history_manager.ts` - Improve history structure
5. `src/agent/task_manager.ts` - Enhance task tracking

## Technical Debt Considerations

- The current vectorization is a placeholder implementation
- Need to evaluate proper embedding libraries
- Consider performance implications of vector database integration
