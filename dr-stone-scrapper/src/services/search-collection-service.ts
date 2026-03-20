import { setTimeout as sleep } from "node:timers/promises";

import type { DatabaseServices, SearchCollectionResult, TrackedProduct } from "@dr-stone/database";
import { buildSearchQuery } from "@dr-stone/database";

import { buildScrapeFailure } from "../failures.js";
import { titleContainsAllTerms } from "../normalizers.js";
import type { LoggerLike, SearchSource } from "../types.js";

interface SearchCollectionServiceOptions {
  sourceMinIntervalMsByName?: Partial<Record<string, number>>;
  sleepFn?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class SearchCollectionService {
  private readonly maxResultsPerRun = 4;
  private readonly sourceMinIntervalMsByName: Partial<Record<string, number>>;
  private readonly sleepFn: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly sourceReservationChain = new Map<string, Promise<void>>();
  private readonly sourceNextStartAtMs = new Map<string, number>();

  constructor(
    private readonly database: DatabaseServices,
    private readonly searchSources: SearchSource[],
    private readonly logger: LoggerLike,
    options: SearchCollectionServiceOptions = {}
  ) {
    this.sourceMinIntervalMsByName = options.sourceMinIntervalMsByName ?? {};
    this.sleepFn = options.sleepFn ?? sleep;
    this.now = options.now ?? Date.now;
  }

  async close(): Promise<void> {
    await Promise.all(this.searchSources.map((source) => source.close()));
  }

  async collectTrackedProduct(trackedProduct: TrackedProduct): Promise<SearchCollectionResult> {
    const searchQuery = buildSearchQuery(trackedProduct.searchTerms);
    const searchRunIds: string[] = [];
    let totalResults = 0;
    let matchedResults = 0;
    let pageCount = 0;
    let successfulRuns = 0;
    let failedRuns = 0;
    let lastError: unknown;

    this.logger.info(
      {
        event: "search_collection_started",
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        searchTerms: trackedProduct.searchTerms,
        searchQuery,
        sourceCount: this.searchSources.length,
        enabledSources: this.searchSources.map((source) => source.sourceName)
      },
      "search_collection_started"
    );

    for (const source of this.searchSources) {
      const searchUrl = source.buildSearchUrl(searchQuery);
      this.logger.info(
        {
          event: "search_source_started",
          trackedProductId: trackedProduct.id,
          productTitle: trackedProduct.productTitle,
          source: source.sourceName,
          strategy: source.strategy,
          searchTerm: searchQuery,
          searchUrl
        },
        "search_source_started"
      );
      const searchRunId = await this.database.searchRuns.create({
        trackedProductId: trackedProduct.id,
        sourceName: source.sourceName,
        searchTerm: searchQuery,
        searchUrl
      });
      searchRunIds.push(searchRunId);
      this.logger.info(
        {
          event: "search_source_run_created",
          trackedProductId: trackedProduct.id,
          productTitle: trackedProduct.productTitle,
          searchRunId,
          source: source.sourceName,
          searchTerm: searchQuery,
          searchUrl
        },
        "search_source_run_created"
      );

      try {
        await this.reserveSourceStartSlot(source, {
          trackedProduct,
          searchRunId,
          searchTerm: searchQuery,
          searchUrl
        });
        const run = await source.search(searchQuery);
        const matchedItems = run.items
          .filter((item) => titleContainsAllTerms(trackedProduct.searchTerms, item.title))
          .sort(
            (left, right) =>
              Number(left.price) - Number(right.price) ||
              left.position - right.position ||
              left.title.localeCompare(right.title)
          )
          .slice(0, this.maxResultsPerRun);

        const inserted = await this.database.searchRuns.persistItems({
          searchRunId,
          trackedProductId: trackedProduct.id,
          items: matchedItems,
          capturedAt: run.fetchedAt
        });

        await this.database.searchRuns.finish(searchRunId, {
          status: "succeeded",
          totalResults: run.totalResults,
          matchedResults: inserted,
          pageCount: run.pageCount,
          message: "lowest_prices_saved"
        });

        this.logger.info(
          {
            event: "search_source_succeeded",
            trackedProductId: trackedProduct.id,
            productTitle: trackedProduct.productTitle,
            searchRunId,
            source: source.sourceName,
            totalResults: run.totalResults,
            matchedResults: inserted,
            pageCount: run.pageCount
          },
          "search_source_succeeded"
        );

        totalResults += run.totalResults;
        matchedResults += inserted;
        pageCount += run.pageCount;
        successfulRuns += 1;
      } catch (error) {
        const failure = buildScrapeFailure(source.sourceName, searchUrl, error);
        await this.database.scrapeFailures.record(failure, { searchRunId });
        await this.database.searchRuns.finish(searchRunId, {
          status: "failed",
          message: failure.message
        });
        this.logger.error(
          {
            event: "search_source_failed",
            trackedProductId: trackedProduct.id,
            productTitle: trackedProduct.productTitle,
            searchRunId,
            source: source.sourceName,
            stage: failure.stage,
            errorCode: failure.errorCode,
            errorType: failure.errorType,
            message: failure.message,
            targetUrl: failure.targetUrl
          },
          "search_source_failed"
        );
        failedRuns += 1;
        lastError = error;
      }
    }

    if (successfulRuns === 0 && lastError) {
      throw lastError;
    }

    const result: SearchCollectionResult = {
      trackedProductId: trackedProduct.id,
      searchRunIds,
      successfulRuns,
      failedRuns,
      totalResults,
      matchedResults,
      pageCount
    };

    this.logger.info(
      {
        event: "search_collection_succeeded",
        ...result
      },
      "search_collection_succeeded"
    );

    return result;
  }

  async collectAllActive(): Promise<SearchCollectionResult[]> {
    const trackedProducts = await this.database.trackedProducts.list({ activeOnly: true });
    this.logger.info(
      {
        event: "search_collection_cycle_started",
        trackedProductCount: trackedProducts.length,
        enabledSources: this.searchSources.map((source) => source.sourceName)
      },
      "search_collection_cycle_started"
    );
    return Promise.all(trackedProducts.map((product) => this.collectTrackedProduct(product)));
  }

  async collectDue(): Promise<SearchCollectionResult[]> {
    const trackedProducts = await this.database.trackedProducts.listDue();
    return Promise.all(trackedProducts.map((product) => this.collectTrackedProduct(product)));
  }

  private async reserveSourceStartSlot(
    source: SearchSource,
    input: {
      trackedProduct: TrackedProduct;
      searchRunId: string;
      searchTerm: string;
      searchUrl: string;
    }
  ): Promise<void> {
    const minIntervalMs = Math.max(0, this.sourceMinIntervalMsByName[source.sourceName] ?? 0);
    if (minIntervalMs === 0) {
      return;
    }

    const previousReservation = this.sourceReservationChain.get(source.sourceName) ?? Promise.resolve();
    let releaseReservation!: () => void;
    const currentReservation = new Promise<void>((resolve) => {
      releaseReservation = resolve;
    });

    this.sourceReservationChain.set(
      source.sourceName,
      previousReservation.then(() => currentReservation)
    );

    await previousReservation;

    try {
      const nowMs = this.now();
      const nextAllowedAtMs = this.sourceNextStartAtMs.get(source.sourceName) ?? nowMs;
      const waitMs = Math.max(0, nextAllowedAtMs - nowMs);

      if (waitMs > 0) {
        this.logger.info(
          {
            event: "search_source_rate_limit_wait_started",
            trackedProductId: input.trackedProduct.id,
            productTitle: input.trackedProduct.productTitle,
            searchRunId: input.searchRunId,
            source: source.sourceName,
            strategy: source.strategy,
            searchTerm: input.searchTerm,
            searchUrl: input.searchUrl,
            waitSeconds: waitMs / 1000,
            scheduledStartAt: new Date(nowMs + waitMs).toISOString(),
            minIntervalSeconds: minIntervalMs / 1000
          },
          "search_source_rate_limit_wait_started"
        );
        await this.sleepFn(waitMs);
      }

      const startedAtMs = this.now();
      this.sourceNextStartAtMs.set(source.sourceName, startedAtMs + minIntervalMs);
      this.logger.info(
        {
          event: "search_source_slot_acquired",
          trackedProductId: input.trackedProduct.id,
          productTitle: input.trackedProduct.productTitle,
          searchRunId: input.searchRunId,
          source: source.sourceName,
          strategy: source.strategy,
          searchTerm: input.searchTerm,
          searchUrl: input.searchUrl,
          startedAt: new Date(startedAtMs).toISOString(),
          nextAllowedAt: new Date(startedAtMs + minIntervalMs).toISOString(),
          minIntervalSeconds: minIntervalMs / 1000
        },
        "search_source_slot_acquired"
      );
    } finally {
      releaseReservation();
    }
  }
}
