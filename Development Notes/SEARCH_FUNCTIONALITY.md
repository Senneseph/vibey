# Vibey Internet Search and RAG Implementation

## Overview

Vibey now includes internet search capabilities with RAG (Retrieval-Augmented Generation) functionality. This allows Vibey to search the internet, cache results using vectorization, and retrieve relevant information when needed.

## Key Features

1. **Internet Search Integration** - Search the web for information using vectorized caching
2. **Vector Database Caching** - Results are cached using vector embeddings for semantic similarity search
3. **RAG Implementation** - Retrieve relevant information from cached results using semantic search
4. **Code Snippet Fetching** - Fetch and cache code snippets from online repositories and documentation

## How It Works

### 1. Search Service

The `SearchService` handles internet search queries and integrates with the vector database for caching and retrieval.

### 2. Vector Search

The `VectorSearch` class manages caching and vectorization of search results using a mock implementation. In a production environment, this would integrate with vector databases like Chroma, Weaviate, or Qdrant.

### 3. Tool Integration

The following tools are available for use:

- `internet_search` - Search the internet with caching
- `get_cached_search_results` - Retrieve cached search results using semantic similarity
- `fetch_code_snippet` - Fetch code snippets from online sources and cache them

## Implementation Details

### Search Process

1. User queries internet search tool
2. System checks vector database for cached results
3. If cached results exist, returns them
4. If not, performs actual search and caches results
5. Results are stored with vector embeddings for semantic similarity

### Vectorization

In a real implementation, the system would:

1. Generate vector embeddings for search queries and results
2. Store embeddings in a vector database
3. Perform semantic similarity search using cosine similarity
4. Retrieve most relevant results based on semantic meaning

## Future Enhancements

1. Integration with Google Custom Search API
2. Support for multiple vector database backends
3. Advanced filtering and ranking of search results
4. Integration with GitHub, documentation sites, and code repositories
5. Real-time updates and refresh of cached results

## Usage Examples

### Basic Search
```
internet_search {
  "query": "how to implement RAG with vector databases",
  "max_results": 5
}
```

### Fetch Code Snippet
```
fetch_code_snippet {
  "url": "https://github.com/example/repo/blob/main/example.js",
  "description": "Example of RAG implementation"
}
```

### Get Cached Results
```
get_cached_search_results {
  "query": "vector database comparison",
  "max_results": 3
}
```
