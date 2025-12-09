# Checkpoint System for Attention Management

## Overview

Checkpoints are a mechanism for managing working context in the Vibey agent. They allow us to clear working context once certain items are completed, helping to maintain a focused and efficient attention window.

## How It Works

1. **Creating Checkpoints**: When a task or step is completed, we can create a checkpoint that marks which context items were used.
2. **Context Management**: The system maintains a master context with all relevant information.
3. **Checkpoint Review**: We can review what was in the last context window and decide what can be taken out.
4. **Context Clearing**: Once items are checkpointed, they can be cleared from working memory to make room for new information.

## Key Methods

### `createCheckpoint(description: string, contextItems?: string[]): Checkpoint`
Creates a new checkpoint with a description and list of context items that were used.

### `getCheckpoints(): Checkpoint[]`
Retrieves all created checkpoints.

### `clearCheckpointContext(checkpointId: string): void`
Clears context items that were part of a specific checkpoint.

### `clearAllCheckpointContext(): void`
Clears all context items that were part of checkpoints.

### `getContextSummary(): string`
Provides a summary of what's currently in the context window.

### `reviewCheckpointContext(): void`
Reviews all checkpoints and current context items for analysis.

## Usage Example

```typescript
// Create a checkpoint after completing a task
const checkpoint = contextManager.createCheckpoint(
  'Completed file analysis',
  ['src/components/MyComponent.tsx', 'src/utils/helpers.ts']
);

// Later, clear the context for that checkpoint
contextManager.clearCheckpointContext(checkpoint.id);

// Review current context
console.log(contextManager.getContextSummary());
```

## Benefits

- **Memory Management**: Prevents context window from becoming too large
- **Attention Focus**: Keeps only relevant information in working memory
- **Task Completion Tracking**: Helps track what has been accomplished
- **Efficiency**: Reduces token usage by removing outdated context
