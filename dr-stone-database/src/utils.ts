import { randomUUID } from "node:crypto";

export const DEFAULT_RUNS_PER_DAY = 4;
export const MAX_SEARCH_TERMS = 5;

export function newId(): string {
  return randomUUID().replaceAll("-", "");
}

export function utcNow(): string {
  return new Date().toISOString();
}

export function cleanSearchTerm(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).split(/\s+/).filter(Boolean).join(" ");
  return text.length > 0 ? text : null;
}

export function normalizeSearchTerms(values: Iterable<unknown>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const term = cleanSearchTerm(value);
    if (term === null) {
      continue;
    }

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }

    normalized.push(term);
    seen.add(key);
  }

  if (normalized.length === 0) {
    throw new Error("search_terms must contain at least one non-empty term.");
  }

  if (normalized.length > MAX_SEARCH_TERMS) {
    throw new Error(`search_terms must contain at most ${MAX_SEARCH_TERMS} terms.`);
  }

  return normalized;
}

export function buildSearchQuery(searchTerms: string[]): string {
  return searchTerms.join(" ");
}

export function parseSearchTermsRow(row: {
  searchTermsJson?: string | null;
  searchTerm?: string | null;
}): string[] {
  if (row.searchTermsJson) {
    const parsed = JSON.parse(row.searchTermsJson);
    if (Array.isArray(parsed)) {
      return normalizeSearchTerms(parsed);
    }
  }

  return normalizeSearchTerms([row.searchTerm ?? ""]);
}

export function asBoolean(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export function normalizeTimestampOutput(value: string): string {
  if (value.includes("T")) {
    return value.endsWith("Z") ? value.replace("Z", "+00:00") : value;
  }

  const normalized = new Date(value);
  return normalized.toISOString().replace(".000Z", "+00:00").replace("Z", "+00:00");
}
