import { buildSearchQuery } from "@dr-stone/database";
import type { DatabaseServices, TrackedProduct } from "@dr-stone/database";
import { PgBoss } from "pg-boss";
import type { Job, SendOptions } from "pg-boss";

import type { LoggerLike, ScrapperSettings } from "../types.js";
import { SearchCollectionService } from "./search-collection-service.js";

export const AMAZON_JOB_QUEUE = "amazon-search";

export interface AmazonSearchJobData {
  trackedProductId: string;
  productTitle: string;
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

export interface AmazonScheduleSummary {
  scheduledCount: number;
  skippedCount: number;
}

export class AmazonJobScheduler {
  private readonly boss: BossLike;
  private readonly queueName: string;
  private readonly now: () => number;
  private workerId: string | null = null;

  constructor(
    private readonly settings: ScrapperSettings,
    private readonly database: DatabaseServices,
    private readonly service: SearchCollectionService,
    private readonly logger: LoggerLike,
    options: {
      boss?: BossLike;
      queueName?: string;
      now?: () => number;
    } = {}
  ) {
    this.boss = options.boss ?? new PgBoss(settings.databaseUrl);
    this.queueName = options.queueName ?? AMAZON_JOB_QUEUE;
    this.now = options.now ?? Date.now;

    this.boss.on("error", (error) => {
      this.logger.error(
        {
          event: "amazon_job_queue_error",
          queueName: this.queueName,
          errorType: error instanceof Error ? error.constructor.name : "UnknownError",
          errorMessage: error instanceof Error ? error.message : String(error)
        },
        "amazon_job_queue_error"
      );
    });

    this.boss.on("warning", (warning) => {
      this.logger.warn(
        {
          event: "amazon_job_queue_warning",
          queueName: this.queueName,
          warning:
            warning && typeof warning === "object" ? JSON.stringify(warning) : String(warning)
        },
        "amazon_job_queue_warning"
      );
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(this.queueName, {
      policy: "singleton",
      retryLimit: Math.max(0, this.settings.maxRetries),
      retryDelay: Math.max(1, Math.round(this.settings.retryBackoffSeconds)),
      retryBackoff: this.settings.maxRetries > 1,
      expireInSeconds: Math.max(300, this.settings.timeoutSeconds * 6)
    });
    this.workerId = await this.boss.work<AmazonSearchJobData>(
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
        event: "amazon_job_worker_started",
        queueName: this.queueName,
        workerId: this.workerId,
        minIntervalSeconds: this.settings.amazonMinIntervalSeconds
      },
      "amazon_job_worker_started"
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

  async scheduleActiveTrackedProducts(): Promise<AmazonScheduleSummary> {
    const trackedProducts = await this.database.trackedProducts.list({ activeOnly: true });
    return this.scheduleTrackedProducts(trackedProducts);
  }

  async scheduleTrackedProducts(
    trackedProducts: TrackedProduct[]
  ): Promise<AmazonScheduleSummary> {
    let scheduledCount = 0;
    let skippedCount = 0;
    const baseTime = this.now();
    const sendOptions: SendOptions = {
      retryLimit: Math.max(0, this.settings.maxRetries),
      retryDelay: Math.max(1, Math.round(this.settings.retryBackoffSeconds)),
      retryBackoff: this.settings.maxRetries > 1,
      expireInSeconds: Math.max(300, this.settings.timeoutSeconds * 6),
      singletonSeconds: Math.max(
        this.settings.intervalSeconds,
        this.settings.amazonMinIntervalSeconds
      )
    };

    for (const [index, trackedProduct] of trackedProducts.entries()) {
      const scheduledFor = new Date(
        baseTime + index * this.settings.amazonMinIntervalSeconds * 1000
      );
      const payload: AmazonSearchJobData = {
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        searchQuery: buildSearchQuery(trackedProduct.searchTerms),
        queuedAt: new Date(baseTime).toISOString(),
        scheduledFor: scheduledFor.toISOString()
      };
      const jobId = await this.boss.sendAfter(
        this.queueName,
        payload,
        {
          ...sendOptions,
          singletonKey: trackedProduct.id
        },
        scheduledFor
      );

      if (jobId) {
        scheduledCount += 1;
        this.logger.info(
          {
            event: "amazon_job_scheduled",
            queueName: this.queueName,
            jobId,
            trackedProductId: trackedProduct.id,
            productTitle: trackedProduct.productTitle,
            searchQuery: payload.searchQuery,
            scheduledFor: payload.scheduledFor,
            delaySeconds: index * this.settings.amazonMinIntervalSeconds
          },
          "amazon_job_scheduled"
        );
      } else {
        skippedCount += 1;
        this.logger.info(
          {
            event: "amazon_job_schedule_skipped",
            queueName: this.queueName,
            trackedProductId: trackedProduct.id,
            productTitle: trackedProduct.productTitle,
            searchQuery: payload.searchQuery,
            scheduledFor: payload.scheduledFor,
            reason: "singleton_conflict"
          },
          "amazon_job_schedule_skipped"
        );
      }
    }

    this.logger.info(
      {
        event: "amazon_job_schedule_completed",
        queueName: this.queueName,
        trackedProductCount: trackedProducts.length,
        scheduledCount,
        skippedCount,
        minIntervalSeconds: this.settings.amazonMinIntervalSeconds
      },
      "amazon_job_schedule_completed"
    );

    return {
      scheduledCount,
      skippedCount
    };
  }

  private async handleJob(job: Job<AmazonSearchJobData>): Promise<void> {
    const trackedProduct = await this.database.trackedProducts.getById(job.data.trackedProductId);
    if (!trackedProduct || !trackedProduct.active) {
      this.logger.warn(
        {
          event: "amazon_job_skipped",
          queueName: this.queueName,
          jobId: job.id,
          trackedProductId: job.data.trackedProductId,
          reason: trackedProduct ? "inactive_tracked_product" : "tracked_product_not_found"
        },
        "amazon_job_skipped"
      );
      return;
    }

    this.logger.info(
      {
        event: "amazon_job_started",
        queueName: this.queueName,
        jobId: job.id,
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        searchQuery: buildSearchQuery(trackedProduct.searchTerms),
        scheduledFor: job.data.scheduledFor
      },
      "amazon_job_started"
    );

    const result = await this.service.collectTrackedProduct(trackedProduct);
    this.logger.info(
      {
        event: "amazon_job_completed",
        queueName: this.queueName,
        jobId: job.id,
        trackedProductId: trackedProduct.id,
        productTitle: trackedProduct.productTitle,
        successfulRuns: result.successfulRuns,
        failedRuns: result.failedRuns,
        totalResults: result.totalResults,
        matchedResults: result.matchedResults
      },
      "amazon_job_completed"
    );
  }
}
