export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string; // Full content if available
  source?: string; // Where this result came from (e.g., GitHub, docs, etc.)
  timestamp?: Date;
  embedding?: number[]; // Vector embedding for semantic search
}

export interface SearchQuery {
  query: string;
  limit?: number;
  sources?: string[]; // Specific sources to search (e.g., ['github', 'docs', 'stackoverflow'])
  filters?: SearchFilters;
}

export interface SearchFilters {
  minRelevance?: number;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  contentTypes?: string[]; // e.g., ['documentation', 'code', 'tutorial']
}

export interface SearchResults {
  query: string;
  results: SearchResult[];
  cached: boolean;
  timestamp?: Date;
  totalResults?: number;
}

export interface SearchContext {
  query: string;
  results: SearchResult[];
  relevantResults: SearchResult[];
  timestamp: Date;
}