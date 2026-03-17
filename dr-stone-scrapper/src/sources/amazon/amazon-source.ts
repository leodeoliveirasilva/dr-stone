import type { SearchRunResult, SearchResultItem } from "@dr-stone/database";
import type { Browser, Page } from "playwright";

import { normalizeAvailability, normalizeCurrency, normalizePrice } from "../../normalizers.js";
import type { LoggerLike, SearchSource } from "../../types.js";

export class AmazonSource implements SearchSource {
  readonly sourceName = "amazon";
  readonly strategy = "browser" as const;
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly logger: LoggerLike) {}

  buildSearchUrl(searchTerm: string): string {
    const url = new URL("https://www.amazon.com.br/s");
    url.searchParams.set("k", searchTerm);
    return url.toString();
  }

  async search(searchTerm: string): Promise<SearchRunResult> {
    const { chromium } = await import("playwright");
    this.browserPromise ??= chromium.launch({ headless: true });
    const browser = await this.browserPromise;
    const context = await browser.newContext({
      locale: "pt-BR",
      extraHTTPHeaders: {
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    try {
      const page = await context.newPage();
      const searchUrl = this.buildSearchUrl(searchTerm);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await page.waitForSelector('[data-component-type="s-search-result"]', {
        timeout: 20_000
      });

      const items = await this.extractItems(page);
      const resultNodeCount = await page.locator('[data-component-type="s-search-result"]').count();
      const captchaDetected =
        (await page.locator('input#captchacharacters').count()) > 0 ||
        (await page.locator('form[action*="errors/validateCaptcha"]').count()) > 0;
      const result: SearchRunResult = {
        source: this.sourceName,
        searchTerm,
        resolvedUrl: page.url(),
        totalResults: items.length,
        pageCount: 1,
        items,
        fetchedAt: new Date().toISOString(),
        metadata: {
          searchUrl
        }
      };

      this.logger.info(
        {
          event: "search_scrape_succeeded",
          source: this.sourceName,
          searchTerm,
          resolvedUrl: result.resolvedUrl,
          totalResults: result.totalResults,
          pageCount: 1,
          itemCount: items.length
        },
        "search_scrape_succeeded"
      );

      if (items.length === 0) {
        this.logger.warn(
          {
            event: "search_scrape_empty",
            source: this.sourceName,
            searchTerm,
            resolvedUrl: result.resolvedUrl,
            pageTitle: await page.title(),
            resultNodeCount,
            captchaDetected
          },
          "search_scrape_empty"
        );
      }

      return result;
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (!this.browserPromise) {
      return;
    }

    const browser = await this.browserPromise;
    await browser.close();
    this.browserPromise = null;
  }

  private async extractItems(page: Page): Promise<SearchResultItem[]> {
    return page.$$eval('[data-component-type="s-search-result"]', (nodes) =>
      nodes
        .map((node, index) => {
          const title =
            node.querySelector("h2 a span")?.textContent?.trim() ??
            node.querySelector("h2 span")?.textContent?.trim();
          const link = (node.querySelector('a[href*="/dp/"]') ??
            node.querySelector("h2 a")) as {
            href?: string | null;
            getAttribute(name: string): string | null;
          } | null;
          const asin = node.getAttribute("data-asin")?.trim() ?? null;
          const offscreenPrice =
            node.querySelector(".a-price .a-offscreen")?.textContent?.trim() ?? null;
          const whole = node.querySelector(".a-price-whole")?.textContent?.trim() ?? "";
          const fraction = node.querySelector(".a-price-fraction")?.textContent?.trim() ?? "00";
          const badge =
            node.querySelector('[aria-label*="Amazon"]')?.textContent?.trim() ??
            node.querySelector(".a-badge-label-inner")?.textContent?.trim() ??
            node.querySelector(".a-badge-label")?.textContent?.trim() ??
            null;
          const normalizedWhole = whole.replace(/[,.]+$/, "");
          const href = link?.href?.trim() ?? link?.getAttribute("href")?.trim() ?? null;
          const canonicalUrl = asin
            ? `https://www.amazon.com.br/dp/${asin}`
            : href
              ? new URL(href, "https://www.amazon.com.br").toString().split("?")[0]
              : null;
          const priceText =
            offscreenPrice ?? (normalizedWhole ? `${normalizedWhole},${fraction}` : null);

          if (!title || !canonicalUrl || !priceText) {
            return null;
          }

          return {
            source: "amazon",
            title,
            canonicalUrl,
            price: priceText,
            currency: "BRL",
            availability: "in_stock",
            isAvailable: true,
            position: index + 1,
            metadata: {
              source_product_key: asin,
              seller_name: badge
            }
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    ).then((items) =>
      items.map((item) => {
        const [availability, isAvailable] = normalizeAvailability(item.availability);
        return {
          source: item.source,
          title: item.title,
          canonicalUrl: item.canonicalUrl,
          price: normalizePrice(item.price),
          currency: normalizeCurrency(item.currency),
          availability,
          isAvailable,
          position: item.position,
          metadata: item.metadata
        };
      })
    );
  }
}
