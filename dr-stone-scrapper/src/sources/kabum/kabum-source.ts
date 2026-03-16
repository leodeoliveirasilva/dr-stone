import type { SearchRunResult, SearchResultItem } from "@dr-stone/database";

import { ParseError } from "../../errors.js";
import { canonicalUrl, extractNextData } from "../../html.js";
import { HttpFetcher } from "../../http/http-fetcher.js";
import { normalizeAvailability, normalizeCurrency, normalizePrice } from "../../normalizers.js";
import type { LoggerLike, SearchSource } from "../../types.js";

interface SearchPage {
  resolvedUrl: string;
  totalResults: number;
  totalPages: number;
  pageNumber: number;
  items: SearchResultItem[];
}

export class KabumSource implements SearchSource {
  readonly sourceName = "kabum";
  readonly strategy = "http" as const;
  private readonly baseUrl = "https://www.kabum.com.br";

  constructor(
    private readonly fetcher: HttpFetcher,
    private readonly logger: LoggerLike
  ) {}

  buildSearchUrl(searchTerm: string): string {
    const slug = searchTerm.toLocaleLowerCase().replace(/[^0-9a-z]+/g, "-").replace(/^-|-$/g, "");
    return `${this.baseUrl}/busca/${encodeURIComponent(slug)}`;
  }

  async search(searchTerm: string): Promise<SearchRunResult> {
    const initialUrl = this.buildSearchUrl(searchTerm);
    const firstResponse = await this.fetcher.get(initialUrl);
    const firstPage = this.parseSearchHtml(firstResponse.text, firstResponse.url);

    const items = [...firstPage.items];
    for (let pageNumber = 2; pageNumber <= firstPage.totalPages; pageNumber += 1) {
      const pageUrl = this.withPageNumber(firstPage.resolvedUrl, pageNumber);
      const response = await this.fetcher.get(pageUrl);
      const page = this.parseSearchHtml(response.text, response.url);
      items.push(...page.items);
    }

    const result: SearchRunResult = {
      source: this.sourceName,
      searchTerm,
      resolvedUrl: firstPage.resolvedUrl,
      totalResults: firstPage.totalResults,
      pageCount: firstPage.totalPages,
      items,
      fetchedAt: new Date().toISOString(),
      metadata: {
        searchUrl: initialUrl
      }
    };

    this.logger.info(
      {
        event: "search_scrape_succeeded",
        source: this.sourceName,
        searchTerm,
        resolvedUrl: result.resolvedUrl,
        totalResults: result.totalResults,
        pageCount: result.pageCount,
        itemCount: result.items.length
      },
      "search_scrape_succeeded"
    );

    return result;
  }

  async close(): Promise<void> {}

  parseSearchHtml(html: string, pageUrl: string): SearchPage {
    const nextData = extractNextData(html) ?? {};
    const pageProps = ((nextData.props as { pageProps?: Record<string, unknown> } | undefined)?.pageProps ??
      {}) as Record<string, unknown>;
    const data = this.asObject(pageProps.data);

    if (!data) {
      throw new ParseError("KaBuM search page is missing listing payload", {
        code: "missing_search_payload"
      });
    }

    const catalog = this.asObject(data.catalogServer);
    if (!catalog) {
      throw new ParseError("KaBuM search page is missing catalog data", {
        code: "missing_catalog_data"
      });
    }

    const meta = this.asObject(catalog.meta);
    const rawItems = Array.isArray(catalog.data) ? catalog.data : null;
    if (!meta || !rawItems) {
      throw new ParseError("KaBuM search page has invalid catalog structure", {
        code: "invalid_catalog_structure"
      });
    }

    const page = this.asObject(meta.page) ?? {};
    const parsedItems = rawItems
      .filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null)
      .map((item, index) => this.parseItem(item, index + 1));

    return {
      resolvedUrl: canonicalUrl(html, pageUrl),
      totalResults: Number(meta.totalItemsCount ?? parsedItems.length),
      totalPages: Number(meta.totalPagesCount ?? 1),
      pageNumber: Number(page.number ?? 1),
      items: parsedItems
    };
  }

  private parseItem(item: Record<string, unknown>, position: number): SearchResultItem {
    const title = this.asText(item.name);
    if (!title) {
      throw new ParseError("KaBuM search result is missing product title", {
        code: "missing_search_item_title",
        details: { position }
      });
    }

    const rawPrice = item.priceWithDiscount ?? item.price;
    if (rawPrice === undefined || rawPrice === null) {
      throw new ParseError("KaBuM search result is missing product price", {
        code: "missing_search_item_price",
        details: { position, title }
      });
    }

    const [availability, isAvailable] = normalizeAvailability(this.asText(item.available));
    const manufacturer = this.asObject(item.manufacturer);

    return {
      source: this.sourceName,
      title,
      canonicalUrl: this.buildProductUrl(item),
      price: normalizePrice(typeof rawPrice === "number" ? rawPrice : String(rawPrice)),
      currency: normalizeCurrency("BRL"),
      availability,
      isAvailable,
      position,
      metadata: {
        source_product_key: this.asText(item.code),
        seller_name: this.asText(item.sellerName),
        manufacturer: manufacturer ? this.asText(manufacturer.name) : null,
        price_raw: rawPrice,
        price_marketplace: item.priceMarketplace
      }
    };
  }

  private buildProductUrl(item: Record<string, unknown>): string {
    const code = this.asText(item.code);
    const friendlyName = this.asText(item.friendlyName);

    if (code && friendlyName) {
      return `${this.baseUrl}/produto/${code}/${friendlyName}`;
    }

    if (code) {
      return `${this.baseUrl}/produto/${code}`;
    }

    throw new ParseError("KaBuM search result is missing product URL components", {
      code: "missing_search_item_url"
    });
  }

  private withPageNumber(resolvedUrl: string, pageNumber: number): string {
    const parsed = new URL(resolvedUrl);
    parsed.search = new URLSearchParams({ page_number: String(pageNumber) }).toString();
    return parsed.toString();
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }

    return null;
  }

  private asText(value: unknown): string | null {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    if (typeof value === "boolean") {
      return value ? "in_stock" : "out_of_stock";
    }

    if (value === null || value === undefined) {
      return null;
    }

    return String(value);
  }
}
