import type { SearchResultItem } from "@dr-stone/database";

import { normalizeAvailability, normalizeCurrency, normalizePrice } from "../../normalizers.js";

export const PICHAU_BASE_URL = "https://www.pichau.com.br";

const IGNORED_PATH_PREFIXES = [
  "/api",
  "/app",
  "/blog",
  "/busca",
  "/catalogsearch",
  "/categoria",
  "/checkout",
  "/cliente",
  "/contacts",
  "/customer",
  "/destaques",
  "/eletronicos",
  "/empresas",
  "/favoritos",
  "/hardware",
  "/kit-upgrade",
  "/marca",
  "/mochilas",
  "/monitores",
  "/newsletter",
  "/notebooks-e-portateis",
  "/openbox",
  "/pcs-gamers",
  "/perifericos",
  "/pets",
  "/realidade-virtual",
  "/redes-e-wireless",
  "/search",
  "/sendfriend",
  "/video-games",
  "/wishlist",
  "/vestuario"
] as const;

export interface PichauListingCandidate {
  href: string | null;
  text: string | null;
  ariaLabel: string | null;
  titleAttr: string | null;
  imgAlt: string | null;
  headings: string[];
  dataSku: string | null;
}

export function buildPichauSearchUrls(searchTerm: string): string[] {
  const encodedSearchTerm = encodeURIComponent(searchTerm);
  return [
    `${PICHAU_BASE_URL}/search?q=${encodedSearchTerm}`,
    `${PICHAU_BASE_URL}/busca?q=${encodedSearchTerm}`,
    `${PICHAU_BASE_URL}/catalogsearch/result/?q=${encodedSearchTerm}`
  ];
}

export function parsePichauListingCandidates(
  candidates: readonly PichauListingCandidate[],
  options: {
    baseUrl?: string;
    positionOffset?: number;
  } = {}
): SearchResultItem[] {
  const baseUrl = options.baseUrl ?? PICHAU_BASE_URL;
  const positionOffset = options.positionOffset ?? 0;
  const seenCanonicalUrls = new Set<string>();
  const items: SearchResultItem[] = [];

  for (const candidate of candidates) {
    const item = parsePichauListingCandidate(candidate, baseUrl);
    if (!item || seenCanonicalUrls.has(item.canonicalUrl)) {
      continue;
    }

    seenCanonicalUrls.add(item.canonicalUrl);
    items.push({
      ...item,
      position: positionOffset + items.length + 1
    });
  }

  return items;
}

export function extractPichauPrimaryPrice(text: string): string | null {
  const normalizedText = normalizeSpaces(text);

  const promoPriceMatch = normalizedText.match(
    /\bpor\b\s*:?\s*(?:à\s+vista\s*)?R\$\s*([\d.,]+)/i
  );
  if (promoPriceMatch) {
    return promoPriceMatch[1];
  }

  const cashPriceMatch = normalizedText.match(/(?:à|a)\s+vista\s*R\$\s*([\d.,]+)/i);
  if (cashPriceMatch) {
    return cashPriceMatch[1];
  }

  const matches = [...normalizedText.matchAll(/R\$\s*([\d.,]+)/gi)].map((match) => match[1]);
  if (matches.length === 0) {
    return null;
  }

  if (/de\s+R\$/i.test(normalizedText) && matches.length >= 2) {
    return matches[1];
  }

  return matches[0];
}

function parsePichauListingCandidate(
  candidate: PichauListingCandidate,
  baseUrl: string
): Omit<SearchResultItem, "position"> | null {
  const canonicalUrl = normalizePichauCanonicalUrl(candidate.href, baseUrl);
  if (!canonicalUrl) {
    return null;
  }

  const combinedText = normalizeSpaces(
    [candidate.text, candidate.ariaLabel, candidate.titleAttr].filter(Boolean).join(" ")
  );
  if (!/R\$\s*[\d.,]+/i.test(combinedText)) {
    return null;
  }

  const title = selectPichauTitle(candidate, combinedText);
  const priceText = extractPichauPrimaryPrice(combinedText);
  if (!title || !priceText) {
    return null;
  }

  const [availability, isAvailable] = normalizeAvailability(inferAvailabilityText(combinedText));

  return {
    source: "pichau",
    title,
    canonicalUrl,
    price: normalizePrice(priceText),
    currency: normalizeCurrency("BRL"),
    availability,
    isAvailable,
    metadata: {
      source_product_key: candidate.dataSku ?? deriveSourceProductKey(canonicalUrl),
      seller_name: "Pichau",
      price_raw: priceText
    }
  };
}

function selectPichauTitle(candidate: PichauListingCandidate, combinedText: string): string | null {
  const explicitCandidates = [
    candidate.imgAlt,
    ...candidate.headings,
    candidate.titleAttr,
    candidate.ariaLabel
  ]
    .map(cleanExplicitTitleCandidate)
    .filter((value): value is string => Boolean(value));

  if (explicitCandidates.length > 0) {
    return explicitCandidates[0];
  }

  return deriveTitleFromCardText(combinedText);
}

function cleanExplicitTitleCandidate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = stripCardPrefixes(normalizeSpaces(value));
  if (!normalized || /R\$\s*[\d.,]+/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function deriveTitleFromCardText(text: string): string | null {
  let normalized = stripCardPrefixes(normalizeSpaces(text));
  normalized = normalized.replace(/\s+de\s+R\$\s*[\d.,]+[\s\S]*$/i, "");
  normalized = normalized.replace(/\s+\bpor\b\s*:?\s*(?:à\s+vista\s*)?R\$\s*[\d.,]+[\s\S]*$/i, "");
  normalized = normalized.replace(/\s+R\$\s*[\d.,]+[\s\S]*$/i, "");
  normalized = normalized.trim();
  return normalized.length > 0 ? normalized : null;
}

function stripCardPrefixes(text: string): string {
  let current = text.trim();

  while (true) {
    const next = current
      .replace(/^(?:\d+\s*%\s*OFF\s*)+/i, "")
      .replace(/^(?:\d+\s*UNID(?:\s+DISPON[IÍ]VEIS?)?\s*)+/i, "")
      .replace(/^(?:EM\s+ESTOQUE\s*)+/i, "")
      .replace(/^(?:FRETE\s+GR[ÁA]TIS:?\s*(?:SUL\s+E\s+SUDESTE|SUL|SUDESTE)?\s*)+/i, "")
      .replace(/^(?:MONTADO\s+E\s+CERTIFICADO\s*)+/i, "")
      .replace(/^(?:PR[ÉE]-?VENDA\s*)+/i, "")
      .trim();

    if (next === current) {
      return next;
    }

    current = next;
  }
}

function inferAvailabilityText(text: string): string {
  const normalized = normalizeSpaces(text).toLowerCase();
  if (/indispon|esgot/.test(normalized)) {
    return "out_of_stock";
  }

  if (/em estoque|\b\d+\s*unid\b|r\$\s*[\d.,]+/.test(normalized)) {
    return "in_stock";
  }

  return "unknown";
}

function normalizePichauCanonicalUrl(href: string | null, baseUrl: string): string | null {
  if (!href) {
    return null;
  }

  try {
    const parsedUrl = new URL(href, baseUrl);
    const baseHost = new URL(baseUrl).host;
    if (parsedUrl.host !== baseHost) {
      return null;
    }

    parsedUrl.hash = "";
    parsedUrl.search = "";

    const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
    if (
      normalizedPathname === "/" ||
      IGNORED_PATH_PREFIXES.some(
        (prefix) =>
          normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`)
      )
    ) {
      return null;
    }

    return `${parsedUrl.origin}${normalizedPathname}`;
  } catch {
    return null;
  }
}

function deriveSourceProductKey(canonicalUrl: string): string {
  const pathname = new URL(canonicalUrl).pathname.replace(/\/+$/, "");
  return pathname.split("/").filter(Boolean).at(-1) ?? pathname;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
