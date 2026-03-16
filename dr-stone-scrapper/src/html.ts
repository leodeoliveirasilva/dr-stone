import { load } from "cheerio";

export function makeDocument(html: string) {
  return load(html);
}

export function extractNextData(html: string): Record<string, unknown> | null {
  const $ = load(html);
  const payload = $("script#__NEXT_DATA__").text().trim();
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function canonicalUrl(html: string, baseUrl: string): string {
  const $ = load(html);
  const candidate = $('link[rel="canonical"]').attr("href");
  if (!candidate) {
    return baseUrl;
  }

  return new URL(candidate, baseUrl).toString();
}
