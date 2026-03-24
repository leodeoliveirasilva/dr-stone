import type { SearchResultItem } from "@dr-stone/database";

import { normalizeAvailability, normalizeCurrency, normalizePrice } from "../../normalizers.js";

export const MERCADO_LIVRE_SEARCH_BASE_URL = "https://lista.mercadolivre.com.br";

const ALLOWED_HOST_SUFFIX = "mercadolivre.com.br";

export interface MercadoLivreListingCandidate {
  href: string | null;
  title: string | null;
  titleAttr: string | null;
  ariaLabel: string | null;
  cardText: string | null;
  priceText: string | null;
  priceWhole: string | null;
  priceCents: string | null;
  currencyText: string | null;
  sellerText: string | null;
  shippingText: string | null;
  installmentsText: string | null;
  stockText: string | null;
  listingType: string | null;
  dataId: string | null;
}

export function buildMercadoLivreSearchUrl(searchTerm: string): string {
  const slug = searchTerm
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^0-9a-z]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!slug) {
    return `${MERCADO_LIVRE_SEARCH_BASE_URL}/${encodeURIComponent(searchTerm.trim())}`;
  }

  return `${MERCADO_LIVRE_SEARCH_BASE_URL}/${encodeURIComponent(slug)}`;
}

export function parseMercadoLivreListingCandidates(
  candidates: readonly MercadoLivreListingCandidate[],
  options: {
    baseUrl?: string;
    positionOffset?: number;
  } = {}
): SearchResultItem[] {
  const baseUrl = options.baseUrl ?? MERCADO_LIVRE_SEARCH_BASE_URL;
  const positionOffset = options.positionOffset ?? 0;
  const seenCanonicalUrls = new Set<string>();
  const items: SearchResultItem[] = [];

  for (const candidate of candidates) {
    const item = parseMercadoLivreListingCandidate(candidate, baseUrl);
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

export function extractMercadoLivrePrimaryPrice(text: string): string | null {
  const normalizedText = normalizeSpaces(text);
  const promoMatch = normalizedText.match(/\bpor\b\s*R\$\s*([\d.]+)(?:,(\d{2}))?/i);
  if (promoMatch) {
    return formatDetectedPrice(promoMatch[1], promoMatch[2]);
  }

  const matches = [...normalizedText.matchAll(/R\$\s*([\d.]+)(?:,(\d{2}))?/gi)];
  if (matches.length === 0) {
    return null;
  }

  return formatDetectedPrice(matches[0]?.[1], matches[0]?.[2]);
}

function parseMercadoLivreListingCandidate(
  candidate: MercadoLivreListingCandidate,
  baseUrl: string
): Omit<SearchResultItem, "position"> | null {
  const canonicalUrl = normalizeMercadoLivreCanonicalUrl(candidate.href, baseUrl);
  if (!canonicalUrl) {
    return null;
  }

  const title = selectMercadoLivreTitle(candidate);
  const priceText =
    buildExplicitPriceText(candidate.priceWhole, candidate.priceCents) ??
    extractMercadoLivrePrimaryPrice([candidate.priceText, candidate.cardText].filter(Boolean).join(" "));

  if (!title || !priceText) {
    return null;
  }

  const [availability, isAvailable] = normalizeAvailability(
    inferAvailabilityText(
      [candidate.stockText, candidate.shippingText, candidate.cardText].filter(Boolean).join(" ")
    )
  );

  return {
    source: "mercadolivre",
    title,
    canonicalUrl,
    price: normalizePrice(priceText),
    currency: normalizeCurrency(candidate.currencyText ?? "BRL"),
    availability,
    isAvailable,
    metadata: {
      source_product_key: deriveMercadoLivreSourceProductKey(canonicalUrl, candidate.dataId),
      seller_name: "Mercado Livre",
      listing_type: normalizeNullableText(candidate.listingType),
      shipping_summary: normalizeNullableText(candidate.shippingText),
      installments_text: normalizeNullableText(candidate.installmentsText),
      price_raw: priceText
    }
  };
}

function selectMercadoLivreTitle(candidate: MercadoLivreListingCandidate): string | null {
  const explicitTitle = [
    candidate.title,
    candidate.titleAttr,
    candidate.ariaLabel
  ]
    .map(cleanTitleCandidate)
    .find((value): value is string => Boolean(value));

  if (explicitTitle) {
    return explicitTitle;
  }

  return deriveTitleFromCardText(candidate.cardText);
}

function cleanTitleCandidate(value: string | null): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized || /R\$\s*[\d.,]+/i.test(normalized)) {
    return null;
  }

  return normalized;
}

function deriveTitleFromCardText(value: string | null): string | null {
  const normalized = normalizeNullableText(value);
  if (!normalized) {
    return null;
  }

  return normalized
    .replace(/\bpatrocinado\b/gi, "")
    .replace(/\s+por\s+R\$\s*[\d.,]+[\s\S]*$/i, "")
    .replace(/\s+R\$\s*[\d.,]+[\s\S]*$/i, "")
    .trim() || null;
}

function buildExplicitPriceText(priceWhole: string | null, priceCents: string | null): string | null {
  const normalizedWhole = priceWhole?.replace(/[^\d.]/g, "").trim() ?? "";
  if (!normalizedWhole) {
    return null;
  }

  const normalizedCents = (priceCents?.replace(/\D/g, "").slice(0, 2) ?? "").padEnd(2, "0");
  return `${normalizedWhole},${normalizedCents}`;
}

function formatDetectedPrice(rawWhole: string | undefined, rawCents: string | undefined): string | null {
  const normalizedWhole = rawWhole?.replace(/[^\d.]/g, "").trim() ?? "";
  if (!normalizedWhole) {
    return null;
  }

  const normalizedCents = (rawCents?.replace(/\D/g, "").slice(0, 2) ?? "").padEnd(2, "0");
  return `${normalizedWhole},${normalizedCents}`;
}

function inferAvailabilityText(text: string): string {
  const normalized = normalizeSpaces(text).toLocaleLowerCase();

  if (
    /indispon|esgot|sem estoque|sem unidades|pausad|sem disponibilidade|não disponível/.test(
      normalized
    )
  ) {
    return "out_of_stock";
  }

  if (/dispon|estoque|envio|frete|retira|chega|r\$\s*[\d.]+/.test(normalized)) {
    return "in_stock";
  }

  return "unknown";
}

function normalizeMercadoLivreCanonicalUrl(href: string | null, baseUrl: string): string | null {
  if (!href) {
    return null;
  }

  try {
    const parsedUrl = new URL(href, baseUrl);
    if (!parsedUrl.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
      return null;
    }

    parsedUrl.hash = "";
    parsedUrl.search = "";

    const normalizedPathname = parsedUrl.pathname.replace(/\/+$/g, "") || "/";
    if (
      normalizedPathname === "/" ||
      normalizedPathname === "/robots.txt" ||
      (!normalizedPathname.includes("/p/") &&
        !/\/MLB-\d+/i.test(normalizedPathname) &&
        !/MLB\d{6,}/i.test(normalizedPathname))
    ) {
      return null;
    }

    return `${parsedUrl.origin}${normalizedPathname}`;
  } catch {
    return null;
  }
}

function deriveMercadoLivreSourceProductKey(canonicalUrl: string, dataId: string | null): string {
  const explicitId = [dataId, canonicalUrl]
    .map((value) => value?.match(/\b(MLB-?\d{6,})\b/i)?.[1] ?? null)
    .find((value): value is string => Boolean(value));

  if (explicitId) {
    return explicitId.replace(/^MLB-/i, "MLB");
  }

  const pathname = new URL(canonicalUrl).pathname.replace(/\/+$/g, "");
  return pathname.split("/").filter(Boolean).at(-1) ?? pathname;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
