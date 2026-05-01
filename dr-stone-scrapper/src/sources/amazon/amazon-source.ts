import type { SearchRunResult, SearchResultItem } from "@dr-stone/database";
import type { Page } from "playwright";

import { FetchError } from "../../errors.js";
import { normalizeAvailability, normalizeCurrency, normalizePrice } from "../../normalizers.js";
import {
  buildBrowserLaunchOptions,
  createBrowserSingleton,
  createStealthBrowserContext,
  type BrowserSingleton
} from "../../browser/playwright.js";
import type { LoggerLike, ScrapperSettings, SearchSource } from "../../types.js";

interface AmazonPageDiagnostics {
  responseStatus: number | null;
  finalUrl: string | null;
  pageTitle: string | null;
  resultNodeCount: number | null;
  captchaDetected: boolean;
  genericErrorDetected: boolean;
  automatedAccessDetected: boolean;
  titleLooksBlocked: boolean;
  bodyTextSnippet: string | null;
}

export class AmazonSource implements SearchSource {
  readonly sourceName = "amazon";
  readonly strategy = "browser" as const;
  private readonly browser: BrowserSingleton;

  constructor(
    private readonly settings: Pick<
      ScrapperSettings,
      "proxyServer" | "proxyUsername" | "proxyPassword" | "userAgent" | "blockHeavyResources"
    >,
    private readonly logger: LoggerLike
  ) {
    this.browser = createBrowserSingleton(
      async () => {
        const { chromium } = await import("playwright");
        return chromium.launch(buildBrowserLaunchOptions(this.settings));
      },
      {
        onDisconnected: () => {
          this.logger.warn(
            { event: "browser_disconnected", source: this.sourceName },
            "browser_disconnected"
          );
        }
      }
    );
  }

  buildSearchUrl(searchTerm: string): string {
    const url = new URL("https://www.amazon.com.br/s");
    url.searchParams.set("k", searchTerm);
    return url.toString();
  }

  async search(searchTerm: string): Promise<SearchRunResult> {
    const browser = await this.browser.get();
    const context = await createStealthBrowserContext(browser, this.settings);
    const searchUrl = this.buildSearchUrl(searchTerm);
    let page: Page | null = null;
    let responseStatus: number | null = null;

    try {
      page = await context.newPage();
      const response = await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      responseStatus = response?.status() ?? null;
      await page.waitForSelector('[data-component-type="s-search-result"]', {
        timeout: 20_000
      });

      const items = await this.extractItems(page);
      const diagnostics = await this.collectDiagnostics(page, responseStatus);
      const result: SearchRunResult = {
        source: this.sourceName,
        searchTerm,
        resolvedUrl: page.url(),
        totalResults: items.length,
        pageCount: 1,
        items,
        fetchedAt: new Date().toISOString(),
        metadata: {
          searchUrl,
          responseStatus: diagnostics.responseStatus,
          pageTitle: diagnostics.pageTitle,
          resultNodeCount: diagnostics.resultNodeCount,
          captchaDetected: diagnostics.captchaDetected,
          genericErrorDetected: diagnostics.genericErrorDetected,
          automatedAccessDetected: diagnostics.automatedAccessDetected,
          titleLooksBlocked: diagnostics.titleLooksBlocked,
          proxyConfigured: Boolean(this.settings.proxyServer)
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
          itemCount: items.length,
          responseStatus: diagnostics.responseStatus,
          pageTitle: diagnostics.pageTitle,
          resultNodeCount: diagnostics.resultNodeCount,
          captchaDetected: diagnostics.captchaDetected,
          genericErrorDetected: diagnostics.genericErrorDetected,
          automatedAccessDetected: diagnostics.automatedAccessDetected,
          titleLooksBlocked: diagnostics.titleLooksBlocked,
          proxyConfigured: Boolean(this.settings.proxyServer)
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
            responseStatus: diagnostics.responseStatus,
            pageTitle: diagnostics.pageTitle,
            resultNodeCount: diagnostics.resultNodeCount,
            captchaDetected: diagnostics.captchaDetected,
            genericErrorDetected: diagnostics.genericErrorDetected,
            automatedAccessDetected: diagnostics.automatedAccessDetected,
            titleLooksBlocked: diagnostics.titleLooksBlocked,
            bodyTextSnippet: diagnostics.bodyTextSnippet,
            proxyConfigured: Boolean(this.settings.proxyServer)
          },
          "search_scrape_empty"
        );
      }

      return result;
    } catch (error) {
      const diagnostics = page
        ? await this.collectDiagnostics(page, responseStatus)
        : this.buildFallbackDiagnostics(searchUrl, responseStatus);
      const errorType = error instanceof Error ? error.constructor.name : "UnknownError";
      const originalMessage = error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof Error && error.name === "TimeoutError"
          ? "amazon_results_timeout"
          : "amazon_search_failed";
      const details = {
        searchTerm,
        responseStatus: diagnostics.responseStatus,
        pageTitle: diagnostics.pageTitle,
        finalUrl: diagnostics.finalUrl,
        resultNodeCount: diagnostics.resultNodeCount,
        captchaDetected: diagnostics.captchaDetected,
        genericErrorDetected: diagnostics.genericErrorDetected,
          automatedAccessDetected: diagnostics.automatedAccessDetected,
          titleLooksBlocked: diagnostics.titleLooksBlocked,
          bodyTextSnippet: diagnostics.bodyTextSnippet,
          proxyConfigured: Boolean(this.settings.proxyServer),
          originalErrorType: errorType,
          originalErrorMessage: originalMessage
        };

      this.logger.error(
        {
          event: "search_scrape_failed",
          source: this.sourceName,
          searchTerm,
          searchUrl,
          errorCode,
          errorType,
          responseStatus: diagnostics.responseStatus,
          finalUrl: diagnostics.finalUrl,
          pageTitle: diagnostics.pageTitle,
          resultNodeCount: diagnostics.resultNodeCount,
          captchaDetected: diagnostics.captchaDetected,
          genericErrorDetected: diagnostics.genericErrorDetected,
          automatedAccessDetected: diagnostics.automatedAccessDetected,
          titleLooksBlocked: diagnostics.titleLooksBlocked,
          bodyTextSnippet: diagnostics.bodyTextSnippet,
          proxyConfigured: Boolean(this.settings.proxyServer),
          originalErrorMessage: originalMessage
        },
        "search_scrape_failed"
      );

      throw new FetchError(this.buildFailureMessage(errorCode, diagnostics), {
        code: errorCode,
        retriable: true,
        statusCode: diagnostics.responseStatus ?? undefined,
        url: searchUrl,
        finalUrl: diagnostics.finalUrl ?? undefined,
        details
      });
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser.close();
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

  private async collectDiagnostics(
    page: Page,
    responseStatus: number | null
  ): Promise<AmazonPageDiagnostics> {
    const pageTitle = await this.safeRead(() => page.title(), null);
    const resultNodeCount = await this.safeRead(
      () => page.locator('[data-component-type="s-search-result"]').count(),
      null
    );
    const captchaDetected = await this.safeRead(
      async () =>
        (await page.locator('input#captchacharacters').count()) > 0 ||
        (await page.locator('form[action*="errors/validateCaptcha"]').count()) > 0,
      false
    );
    const bodyTextSnippet = await this.safeRead(
      async () =>
        (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 400),
      null
    );
    const bodyText = bodyTextSnippet ?? "";
    const genericErrorDetected =
      /algo deu errado/i.test(pageTitle ?? "") || /algo deu errado/i.test(bodyText);
    const automatedAccessDetected =
      /api-services-support@amazon\.com/i.test(bodyText) ||
      /acesso automatizado/i.test(bodyText);
    const titleLooksBlocked =
      /algo deu errado|robot check|captcha/i.test(pageTitle ?? "") || captchaDetected;

    return {
      responseStatus,
      finalUrl: page.url() || null,
      pageTitle,
      resultNodeCount,
      captchaDetected,
      genericErrorDetected,
      automatedAccessDetected,
      titleLooksBlocked,
      bodyTextSnippet
    };
  }

  private buildFallbackDiagnostics(
    searchUrl: string,
    responseStatus: number | null
  ): AmazonPageDiagnostics {
    return {
      responseStatus,
      finalUrl: searchUrl,
      pageTitle: null,
      resultNodeCount: null,
      captchaDetected: false,
      genericErrorDetected: false,
      automatedAccessDetected: false,
      titleLooksBlocked: false,
      bodyTextSnippet: null
    };
  }

  private buildFailureMessage(
    errorCode: string,
    diagnostics: AmazonPageDiagnostics
  ): string {
    const markers: string[] = [];
    if (diagnostics.captchaDetected) {
      markers.push("captcha_detected");
    }
    if (diagnostics.genericErrorDetected) {
      markers.push("generic_error_page");
    }
    if (diagnostics.automatedAccessDetected) {
      markers.push("automated_access_detected");
    }
    if (diagnostics.titleLooksBlocked) {
      markers.push("blocked_title");
    }

    const suffix = [
      diagnostics.pageTitle ? `title=${JSON.stringify(diagnostics.pageTitle)}` : null,
      diagnostics.resultNodeCount !== null ? `resultNodeCount=${diagnostics.resultNodeCount}` : null,
      markers.length > 0 ? `markers=${markers.join(",")}` : null
    ]
      .filter((value): value is string => value !== null)
      .join(" ");

    return suffix ? `${errorCode} ${suffix}` : errorCode;
  }

  private async safeRead<T>(reader: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await reader();
    } catch {
      return fallback;
    }
  }
}
