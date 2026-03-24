import { buildSearchQuery } from "@dr-stone/database";
import type { DatabaseServices, TrackedProduct } from "@dr-stone/database";
import { PgBoss } from "pg-boss";
import type { Job, SendOptions } from "pg-boss";

import type { LoggerLike, ScrapperSettings } from "../types.js";
import { SearchCollectionService } from "./search-collection-service.js";

export const SEARCH_COLLECTION_JOB_QUEUE = "search-collection";

export interface SearchCollectionJobData {
  trackedProductId: string;
  productTitle: string;
  sourceName: string;
  searchQuery: string;
  queuedAt: string;
  scheduledFor: string;
}

interface BossLike {
  on(event: "error" | "warning", listener: (payload: unknown) => void): unknown;
  start(): Promise<unknown>;
  stop(): Promise<void>;
  createQueue(name: string, options?: object): Promise<void>;
  work<ReqData>(
    name: string,
    options: { pollingIntervalSeconds?: number },
    handler: (jobs: Array<Job<ReqData>>) => Promise<unknown>
  ): Promise<string>;
  offWork(name: string, options?: { id?: string; wait?: boolean }): Promise<void>;
  sendAfter(
    name: string,
    data: object | null,
    options: SendOptions | null,
    date: Date
  ): Promise<string | null>;
}

export interface CollectionScheduleSummary {
  scheduledCount: number;
  skippedCount: number;
}

export class CollectionJobScheduler {
  private readonly boss: BossLike;
  private readonly queueName: string;
  private readonly now: () => number;
  private readonly service?: SearchCollectionService;
  private workerId: string | null = null;

  constructor(
    private readonly settings: ScrapperSettings,
    private readonly database: DatabaseServices,
    private readonly logger: LoggerLike,
    private readonly sourceNames: readonly string[],
    options: {
      service?: SearchCollectionService;
      boss?: BossLike;
      queueName?: string;
      now?: () => number;
    } = {}
  ) {
    this.service = options.service;
    this.boss = options.boss ?? new PgBoss(settings.databaseUrl);
    this.queueName = options.queueName ?? SEARCH_COLLECTION_JOB_QUEUE;
    this.now = options.now ?? Date.now;

    this.boss.on("error", (error) => {
      this.logger.error(
        {
          event: "collection_job_queue_error",
          queueName: this.queueName,
          errorType: error instanceof Error ? error.constructor.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        "collection_job_queue_error"
      );
    });

    this.boss.on("warning", (warning) => {
      this.logger.warn(
        {
          event: "collection_job_queue_warning",
          queueName: this.queueName,
          warning:
            warning && typeof warning === "object" ? JSON.stringify(warning) : String(warning)
        },
        "collection_job_queue_warning"
      );
    });
  }

  async start(options: { work?: boolean } = {}): Promise<void> {
    const shouldStartWorker = options.work ?? Boolean(this.service);
    await this.boss.start();
    await this.boss.createQueue(this.queueName, {
      policy: "singleton",
      retryLimit: Math.max(0, this.settings.maxRetries),
      retryDelay: Math.max(1, Math.round(this.settings.retryBackoffSeconds)),
      retryBackoff: this.settings.maxRetries > 1,
      expireInSeconds: Math.max(300, this.settings.timeoutSeconds * 6)
    });

    if (!shouldStartWorker) {
      return;
    }

    if (!this.service) {
      throw new Error("Collection worker cannot start without a collection service");
    }

    this.workerId = await this.boss.work<SearchCollectionJobData>(
      this.queueName,
      {
        pollingIntervalSeconds: 5
      },
      async ([job]) => {
        await this.handleJob(job);
      }
    );

    this.logger.info(
      {
        event: "collection_job_worker_started",
        queueName: this.queueName,
        workerId: this.workerId
      },
      "collection_job_worker_started"
    );
  }

  async stop(): Promise<void> {
    if (this.workerId) {
      await this.boss.offWork(this.queueName, {
        id: this.workerId,
        wait: true
      });
      this.workerId = null;
    }

    await this.boss.stop();
  }

  async enqueueActiveTrackedProducts(
    options: { force?: boolean } = {}
  ): Promise<CollectionScheduleSummary> {
    const trackedProducts = await this.database.trackedProducts.list({ activeOnly: true });
    return this.enqueueTrackedProductsForSources(trackedProducts, this.sourceNames, options);
  }

  async enqueueTrackedProductsForSources(
    trackedProducts: TrackedProduct[],
    sourceNames: readonly string[] = this.sourceNames,
    options: { force?: boolean } = {}
  ): Promise<CollectionScheduleSummary> {
    let scheduledCount = 0;
    let skippedCount = 0;
    const scheduledFor = new Date(this.now());
    const baseSendOptions: SendOptions = {
      retryLimit: Math.max(0, this.settings.maxRetries),
      retryDelay: Math.max(1, Math.round(this.settings.retryBackoffSeconds)),
      retryBackoff: this.settings.maxRetries > 1,
      expireInSeconds: Math.max(300, this.settings.timeoutSeconds * 6)
    };
    const sendOptions: SendOptions = options.force
      ? baseSendOptions
      : {
          ...baseSendOptions,
          singletonSeconds: Math.max(1, this.settings.intervalSeconds)
        };

    for (const trackedProduct of trackedProducts) {
      for (const sourceName of sourceNames) {
        const payload: SearchCollectionJobData = {
          trackedProductId: trackedProduct.id,
          productTitle: trackedProduct.productTitle,
          sourceName,
          searchQuery: buildSearchQuery(trackedProduct.searchTerms),
          queuedAt: scheduledFor.toISOString(),
          scheduledFor: scheduledFor.toISOString()
        };
        const jobSendOptions: SendOptions = options.force
          ? sendOptions
          : { ...sendOptions, singletonKey: `${trackedProduct.id}:${sourceName}` };
        const jobId = await this.boss.sendAfter(
          this.queueName,
          payload,
          jobSendOptions,
          scheduledFor
        );

        if (jobId) {
          scheduledCount += 1;
          this.logger.info(
            {
              event: "collection_job_scheduled",
              queueName: this.queueName,
              jobId,
              trackedProductId: trackedProduct.id,
              productTitle: trackedProduct.productTitle,
              sourceName,
              searchQuery: payload.searchQuery,
              scheduledFor: payload.scheduledFor
            },
            "collection_job_scheduled"
          );
        } else {
          skippedCount += 1;
          this.logger.info(
            {
              event: "collection_job_schedule_skipped",
              queueName: this.queueName,
              trackedProductId: trackedProduct.id,
              productTitle: trackedProduct.productTitle,
              sourceName,
              searchQuery: payload.searchQuery,
              scheduledFor: payload.scheduledFor,
              reason: "singleton_conflict"
            },
            "collection_job_schedule_skipped"
          );
        }
      }
    }

    this.logger.info(
      {
        event: "collection_job_schedule_completed",
        queueName: this.queueName,
        trackedProductCount: trackedProducts.length,
        sourceCount: sourceNames.length,
        scheduledCount,
        skippedCount
      },
      "collection_job_schedule_completed"
    );

    return {
      scheduledCount,
      skippedCount
    };
  }

  private async handleJob(job: Job<SearchCollectionJobData>): Promise<void> {
    if (!this.service) {
      throw new Error("Collection worker cannot process jobs without a collection service");
    }

    const trackedProduct = await this.database.trackedProducts.getById(job.data.trackedProductId);
    if (!trackedProduct || !trackedProduct.active) {
      this.logger.warn(
        {
          event: "collection_job_skipped",
          queueName: this.queueName,
          jobId: job.id,
          trackedProductId: job.data.trackedProductId,
          reason: trackedProduct ? "inactive_tracked_product" : "tracked_product_not_found"
        },
        "collection_job_skipped"
      );
      return;
    }

    this.logger.info(
      {
        event: "collection_job_started",
        queueName: this.queueName,
        jobId: job.id,
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        sourceName: job.data.sourceName,
        searchQuery: buildSearchQuery(trackedProduct.searchTerms),
        scheduledFor: job.data.scheduledFor
      },
      "collection_job_started"
    );

    const result = await this.service.collectTrackedProductForSourceNames(trackedProduct, [
      job.data.sourceName
    ]);
    this.logger.info(
      {
        event: "collection_job_completed",
        queueName: this.queueName,
        jobId: job.id,
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        sourceName: job.data.sourceName,
        successfulRuns: result.successfulRuns,
        failedRuns: result.failedRuns,
        totalResults: result.totalResults,
        matchedResults: result.matchedResults
      },
      "collection_job_completed"
    );
  }
}
