import type { SearchRunResult, SearchResultItem } from "@dr-stone/database";
import type { Browser, BrowserContext, Page } from "playwright";

import { buildBrowserLaunchOptions, createStealthBrowserContext } from "../../browser/playwright.js";
import { FetchError } from "../../errors.js";
import type { LoggerLike, ScrapperSettings, SearchSource } from "../../types.js";
import {
  buildPichauSearchUrls,
  parsePichauListingCandidates,
  PICHAU_BASE_URL,
  type PichauListingCandidate
} from "./pichau-parsing.js";

interface PichauPageExtraction {
  finalUrl: string;
  pageTitle: string;
  bodyTextSnippet: string;
  paginationNumbers: number[];
  candidates: PichauListingCandidate[];
}

interface PichauPageDiagnostics {
  responseStatus: number | null;
  finalUrl: string | null;
  pageTitle: string | null;
  bodyTextSnippet: string | null;
  itemCount: number;
  totalPages: number;
  challengeDetected: boolean;
  challengeTitleDetected: boolean;
  cloudflareDetected: boolean;
  maintenanceTitleDetected: boolean;
}

interface PichauSearchAttempt {
  routeUrl: string;
  resolvedUrl: string;
  items: SearchResultItem[];
  pageCount: number;
  diagnostics: PichauPageDiagnostics;
}

interface PichauSearchRouteOutcome {
  attempt: PichauSearchAttempt | null;
  diagnostics: PichauPageDiagnostics;
}

const MAX_ROUTE_ATTEMPTS = 3;

export class PichauSource implements SearchSource {
  readonly sourceName = "pichau";
  readonly strategy = "browser" as const;
  private browserPromise: Promise<Browser> | null = null;

  constructor(
    private readonly settings: Pick<
      ScrapperSettings,
      "proxyServer" | "proxyUsername" | "proxyPassword" | "userAgent"
    >,
    private readonly logger: LoggerLike
  ) {}

  buildSearchUrl(searchTerm: string): string {
    return buildPichauSearchUrls(searchTerm)[0];
  }

  async search(searchTerm: string): Promise<SearchRunResult> {
    const { chromium } = await import("playwright");
    this.browserPromise ??= chromium.launch(buildBrowserLaunchOptions(this.settings));

    const browser = await this.browserPromise;
    const candidateSearchUrls = buildPichauSearchUrls(searchTerm);
    let bestDiagnostics: PichauPageDiagnostics | null = null;
    let lastRouteError: unknown = null;

    for (const candidateSearchUrl of candidateSearchUrls) {
      for (let routeAttempt = 1; routeAttempt <= MAX_ROUTE_ATTEMPTS; routeAttempt += 1) {
        const context = await createStealthBrowserContext(browser, this.settings);

        try {
          const outcome = await this.trySearchRoute(context, candidateSearchUrl);
          const attempt = outcome.attempt;
          bestDiagnostics = outcome.diagnostics;

          if (!attempt) {
            if (!this.shouldRetryRoute(bestDiagnostics, routeAttempt)) {
              break;
            }

            this.logger.warn(
              {
                event: "search_source_route_retry_scheduled",
                source: this.sourceName,
                searchTerm,
                routeUrl: candidateSearchUrl,
                routeAttempt,
                maxRouteAttempts: MAX_ROUTE_ATTEMPTS,
                responseStatus: bestDiagnostics.responseStatus,
                pageTitle: bestDiagnostics.pageTitle,
                challengeDetected: bestDiagnostics.challengeDetected
              },
              "search_source_route_retry_scheduled"
            );
            continue;
          }

          const result: SearchRunResult = {
            source: this.sourceName,
            searchTerm,
            resolvedUrl: attempt.resolvedUrl,
            totalResults: attempt.items.length,
            pageCount: attempt.pageCount,
            items: attempt.items,
            fetchedAt: new Date().toISOString(),
            metadata: {
              searchUrl: attempt.routeUrl,
              responseStatus: attempt.diagnostics.responseStatus,
              pageTitle: attempt.diagnostics.pageTitle,
              itemCount: attempt.diagnostics.itemCount,
              totalPages: attempt.diagnostics.totalPages,
              challengeDetected: attempt.diagnostics.challengeDetected,
              cloudflareDetected: attempt.diagnostics.cloudflareDetected,
              maintenanceTitleDetected: attempt.diagnostics.maintenanceTitleDetected,
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
              pageCount: result.pageCount,
              itemCount: result.items.length,
              responseStatus: attempt.diagnostics.responseStatus,
              pageTitle: attempt.diagnostics.pageTitle,
              challengeDetected: attempt.diagnostics.challengeDetected,
              proxyConfigured: Boolean(this.settings.proxyServer),
              routeAttempt
            },
            "search_scrape_succeeded"
          );

          return result;
        } catch (error) {
          lastRouteError = error;
          if (!this.shouldRetryRouteError(error, routeAttempt)) {
            throw error;
          }

          const fetchError = error as FetchError;
          this.logger.warn(
            {
              event: "search_source_route_retry_scheduled",
              source: this.sourceName,
              searchTerm,
              routeUrl: candidateSearchUrl,
              routeAttempt,
              maxRouteAttempts: MAX_ROUTE_ATTEMPTS,
              errorCode: fetchError.code,
              responseStatus: fetchError.statusCode ?? null,
              pageTitle:
                typeof fetchError.details.pageTitle === "string" ? fetchError.details.pageTitle : null
            },
            "search_source_route_retry_scheduled"
          );
        } finally {
          await context.close();
        }
      }
    }

    if (lastRouteError instanceof FetchError) {
      throw lastRouteError;
    }

    const errorCode =
      bestDiagnostics?.challengeDetected === true
        ? "pichau_challenge_detected"
        : "pichau_search_failed";
    throw new FetchError(this.buildFailureMessage(errorCode, bestDiagnostics), {
      code: errorCode,
      retriable: true,
      statusCode: bestDiagnostics?.responseStatus ?? undefined,
      url: candidateSearchUrls[0],
      finalUrl: bestDiagnostics?.finalUrl ?? undefined,
      details: {
        searchTerm,
        attemptedUrls: candidateSearchUrls,
        responseStatus: bestDiagnostics?.responseStatus,
        finalUrl: bestDiagnostics?.finalUrl,
        pageTitle: bestDiagnostics?.pageTitle,
        itemCount: bestDiagnostics?.itemCount ?? 0,
        totalPages: bestDiagnostics?.totalPages ?? 0,
        challengeDetected: bestDiagnostics?.challengeDetected ?? false,
        challengeTitleDetected: bestDiagnostics?.challengeTitleDetected ?? false,
        cloudflareDetected: bestDiagnostics?.cloudflareDetected ?? false,
        maintenanceTitleDetected: bestDiagnostics?.maintenanceTitleDetected ?? false,
        bodyTextSnippet: bestDiagnostics?.bodyTextSnippet,
        proxyConfigured: Boolean(this.settings.proxyServer)
      }
    });
  }

  async close(): Promise<void> {
    if (!this.browserPromise) {
      return;
    }

    const browser = await this.browserPromise;
    await browser.close();
    this.browserPromise = null;
  }

  private async trySearchRoute(
    context: BrowserContext,
    routeUrl: string
  ): Promise<PichauSearchRouteOutcome> {
    const page = await context.newPage();
    let responseStatus: number | null = null;

    try {
      const response = await page.goto(routeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 90_000
      });
      responseStatus = response?.status() ?? null;
      await this.settlePage(page);

      const firstPage = await this.extractPage(page, responseStatus);
      if (firstPage.items.length === 0) {
        return {
          attempt: null,
          diagnostics: firstPage.diagnostics
        };
      }

      const items = [...firstPage.items];
      for (let pageNumber = 2; pageNumber <= firstPage.diagnostics.totalPages; pageNumber += 1) {
        const paginatedPage = await context.newPage();
        try {
          const pageUrl = this.withPageNumber(firstPage.finalUrl, pageNumber);
          const paginatedResponse = await paginatedPage.goto(pageUrl, {
            waitUntil: "domcontentloaded",
            timeout: 90_000
          });
          await this.settlePage(paginatedPage);
          const extraction = await this.extractPage(
            paginatedPage,
            paginatedResponse?.status() ?? null,
            items.length
          );

          if (extraction.items.length === 0) {
            throw new FetchError("Pichau paginated listing returned no extractable items", {
              code: extraction.diagnostics.challengeDetected
                ? "pichau_challenge_detected"
                : "pichau_empty_page",
              retriable: true,
              statusCode: extraction.diagnostics.responseStatus ?? undefined,
              url: pageUrl,
              finalUrl: extraction.diagnostics.finalUrl ?? undefined,
              details: {
                pageNumber,
                responseStatus: extraction.diagnostics.responseStatus,
                challengeDetected: extraction.diagnostics.challengeDetected,
                pageTitle: extraction.diagnostics.pageTitle,
                bodyTextSnippet: extraction.diagnostics.bodyTextSnippet
              }
            });
          }

          items.push(...extraction.items);
        } finally {
          await paginatedPage.close();
        }
      }

      const diagnostics = {
        ...firstPage.diagnostics,
        itemCount: items.length
      };

      return {
        attempt: {
          routeUrl,
          resolvedUrl: firstPage.finalUrl,
          items,
          pageCount: firstPage.diagnostics.totalPages,
          diagnostics
        },
        diagnostics
      };
    } finally {
      await page.close();
    }
  }

  private async settlePage(page: Page): Promise<void> {
    await this.safeRead(async () => {
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
    });
    await page.waitForTimeout(4_000);
  }

  private async extractPage(
    page: Page,
    responseStatus: number | null,
    positionOffset = 0
  ): Promise<{
    finalUrl: string;
    items: SearchResultItem[];
    diagnostics: PichauPageDiagnostics;
  }> {
    const extraction = await page.evaluate((): PichauPageExtraction => {
      const pageGlobals = globalThis as unknown as {
        document: {
          title: string;
          body: {
            innerText: string;
          };
          querySelectorAll: (selector: string) => Iterable<unknown>;
        };
        window: {
          location: {
            href: string;
          };
        };
      };
      const { document, window } = pageGlobals;

      const normalizeText = (value: string | null | undefined) =>
        value?.replace(/\s+/g, " ").trim() ?? "";

      const candidates = Array.from(document.querySelectorAll("a[href]")).map((anchor) => {
        const anchorElement = anchor as {
          href?: string | null;
          innerText?: string | null;
          textContent?: string | null;
          getAttribute: (name: string) => string | null;
          querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
          querySelectorAll: (selector: string) => Iterable<{ textContent?: string | null }>;
          closest: (selector: string) => { getAttribute: (name: string) => string | null } | null;
        };

        return {
          href: anchorElement.href || anchorElement.getAttribute("href"),
          text: normalizeText(anchorElement.innerText || anchorElement.textContent),
          ariaLabel: normalizeText(anchorElement.getAttribute("aria-label")),
          titleAttr: normalizeText(anchorElement.getAttribute("title")),
          imgAlt: normalizeText(anchorElement.querySelector("img")?.getAttribute("alt")),
          headings: Array.from(anchorElement.querySelectorAll("h1, h2, h3, h4, strong, b"))
            .map((node) => normalizeText(node.textContent))
            .filter(Boolean),
          dataSku:
            anchorElement.getAttribute("data-sku") ??
            anchorElement.closest("[data-product-sku]")?.getAttribute("data-product-sku") ??
            null
        };
      });

      const paginationNumbers = Array.from(
        document.querySelectorAll("a[href*='?p='], a[href*='&p='], nav a, nav span, li a, li span")
      )
        .map((node) =>
          Number.parseInt(normalizeText((node as { textContent?: string | null }).textContent), 10)
        )
        .filter((value) => Number.isInteger(value) && value > 0);

      return {
        finalUrl: window.location.href,
        pageTitle: document.title,
        bodyTextSnippet: normalizeText(document.body.innerText).slice(0, 500),
        paginationNumbers,
        candidates
      };
    });

    const items = parsePichauListingCandidates(extraction.candidates, {
      baseUrl: PICHAU_BASE_URL,
      positionOffset
    });
    const diagnostics = this.buildDiagnostics(extraction, responseStatus, items.length);

    return {
      finalUrl: extraction.finalUrl,
      items,
      diagnostics
    };
  }

  private buildDiagnostics(
    extraction: PichauPageExtraction,
    responseStatus: number | null,
    itemCount: number
  ): PichauPageDiagnostics {
    const bodyText = extraction.bodyTextSnippet.toLowerCase();
    const pageTitle = extraction.pageTitle;
    const challengeDetected =
      /cloudflare|challenge-platform|always_online|pru pru|site em manuten/i.test(pageTitle) ||
      /cloudflare|challenge-platform|always_online|pru pru|site em manuten|cf-chl/.test(bodyText);

    return {
      responseStatus,
      finalUrl: extraction.finalUrl || null,
      pageTitle: pageTitle || null,
      bodyTextSnippet: extraction.bodyTextSnippet || null,
      itemCount,
      totalPages: Math.max(1, ...extraction.paginationNumbers, itemCount > 0 ? 1 : 0),
      challengeDetected,
      challengeTitleDetected: /pru pru|site em manuten/i.test(pageTitle),
      cloudflareDetected: /cloudflare|cf-chl|challenge-platform/.test(bodyText),
      maintenanceTitleDetected: /site em manuten/i.test(pageTitle)
    };
  }

  private withPageNumber(resolvedUrl: string, pageNumber: number): string {
    const parsedUrl = new URL(resolvedUrl);
    parsedUrl.searchParams.set("p", String(pageNumber));
    return parsedUrl.toString();
  }

  private buildFailureMessage(
    errorCode: string,
    diagnostics: Pick<PichauPageDiagnostics, "pageTitle" | "responseStatus" | "challengeDetected"> | null
  ): string {
    const reason =
      errorCode === "pichau_challenge_detected"
        ? "Pichau challenge page remained active"
        : "Pichau search did not yield extractable listing items";

    const details = [
      diagnostics?.responseStatus ? `status ${diagnostics.responseStatus}` : null,
      diagnostics?.pageTitle ? `title "${diagnostics.pageTitle}"` : null,
      diagnostics?.challengeDetected ? "challenge_detected" : null
    ]
      .filter(Boolean)
      .join(", ");

    return details ? `${reason} (${details})` : reason;
  }

  private async safeRead<T>(callback: () => Promise<T>): Promise<T | null> {
    try {
      return await callback();
    } catch {
      return null;
    }
  }

  private shouldRetryRoute(
    diagnostics: Pick<PichauPageDiagnostics, "challengeDetected" | "responseStatus">,
    routeAttempt: number
  ): boolean {
    return (
      routeAttempt < MAX_ROUTE_ATTEMPTS &&
      (diagnostics.challengeDetected || diagnostics.responseStatus === 403)
    );
  }

  private shouldRetryRouteError(error: unknown, routeAttempt: number): boolean {
    return (
      routeAttempt < MAX_ROUTE_ATTEMPTS &&
      error instanceof FetchError &&
      error.retriable &&
      (error.code === "pichau_challenge_detected" || error.statusCode === 403)
    );
  }
}
