export interface TrackedProduct {
  id: string;
  productTitle: string;
  searchTerms: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResultItem {
  source: string;
  title: string;
  canonicalUrl: string;
  price: string;
  currency: string;
  availability: string;
  isAvailable: boolean;
  position: number;
  metadata: Record<string, unknown>;
}

export interface SearchCollectionResult {
  trackedProductId: string;
  searchRunIds: string[];
  successfulRuns: number;
  failedRuns: number;
  totalResults: number;
  matchedResults: number;
  pageCount: number;
}

export interface SearchRunResult {
  source: string;
  searchTerm: string;
  resolvedUrl: string;
  totalResults: number;
  pageCount: number;
  items: SearchResultItem[];
  fetchedAt: string;
  metadata: Record<string, unknown>;
}

export interface SearchHistoryEntry {
  capturedAt: string;
  productTitle: string;
  canonicalUrl: string;
  price: string;
  currency: string;
  sellerName: string | null;
  searchRunId: string;
}

export interface PeriodMinimumPriceEntry {
  periodStart: string;
  capturedAt: string;
  productTitle: string;
  canonicalUrl: string;
  price: string;
  currency: string;
  sellerName: string | null;
  searchRunId: string;
}

export interface ScrapeFailure {
  source: string;
  stage: string;
  errorCode: string;
  errorType: string;
  message: string;
  targetUrl: string;
  retriable: boolean;
  httpStatus?: number | null;
  finalUrl?: string | null;
  details: Record<string, unknown>;
  capturedAt: string;
}
