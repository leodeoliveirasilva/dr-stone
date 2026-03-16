import { ParseError } from "./errors.js";

export function normalizeTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

export function titleContainsAllTerms(searchTerms: string[], candidateTitle: string): boolean {
  const normalizedCandidate = normalizeTitle(candidateTitle);
  return searchTerms.every((term) => normalizedCandidate.includes(normalizeTitle(term)));
}

export function normalizeCurrency(value?: string | null): string {
  if (!value) {
    return "BRL";
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "R$" || normalized === "BRL") {
    return "BRL";
  }

  return normalized;
}

export function normalizePrice(value: string | number): string {
  if (typeof value === "number") {
    return value.toFixed(2);
  }

  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (!cleaned) {
    throw new ParseError("Price value is empty after normalization");
  }

  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replaceAll(".", "").replace(",", ".")
        : normalized.replaceAll(",", "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replaceAll(".", "").replace(",", ".");
  }

  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new ParseError(`Unable to parse price value: ${value}`);
  }

  return parsed.toFixed(2);
}

export function normalizeAvailability(value?: string | null): [string, boolean] {
  if (!value) {
    return ["unknown", false];
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith("/instock") || normalized === "in_stock" || normalized === "instock") {
    return ["in_stock", true];
  }

  if (
    normalized.endsWith("/outofstock") ||
    normalized === "out_of_stock" ||
    normalized === "outofstock"
  ) {
    return ["out_of_stock", false];
  }

  if (normalized.includes("indispon") || normalized.includes("esgot")) {
    return ["out_of_stock", false];
  }

  if (normalized.includes("dispon")) {
    return ["in_stock", true];
  }

  return [normalized, false];
}
