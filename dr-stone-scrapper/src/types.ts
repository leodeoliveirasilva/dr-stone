import type {
  ScrapeFailure,
  SearchCollectionResult,
  SearchRunResult,
  SearchResultItem,
  TrackedProduct
} from "@dr-stone/database";

export type { ScrapeFailure, SearchCollectionResult, SearchRunResult, SearchResultItem, TrackedProduct };

export interface SearchSource {
  readonly sourceName: string;
  readonly strategy: "http" | "browser";
  buildSearchUrl(searchTerm: string): string;
  search(searchTerm: string): Promise<SearchRunResult>;
  close(): Promise<void>;
}

export interface ScrapperSettings {
  databaseUrl: string;
  timeoutSeconds: number;
  maxRetries: number;
  retryBackoffSeconds: number;
  requestDelaySeconds: number;
  logLevel: string;
  userAgent: string;
  intervalSeconds: number;
  enabledSources: string[];
}

export interface LoggerLike {
  info: (payload: object, message?: string) => void;
  warn: (payload: object, message?: string) => void;
  error: (payload: object, message?: string) => void;
}
