import { describe, expect, test } from "vitest";

import {
  CollectionJobScheduler,
  SEARCH_COLLECTION_JOB_QUEUE
} from "../dr-stone-scrapper/src/services/collection-job-scheduler.js";
import { createLogger } from "../dr-stone-scrapper/src/logger.js";

class FakeBoss {
  public readonly jobs: Array<{
    name: string;
    data: object | null;
    options: Record<string, unknown> | null;
    date: Date;
  }> = [];

  on(): void {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async createQueue(): Promise<void> {}

  async work(): Promise<string> {
    return "worker-1";
  }

  async offWork(): Promise<void> {}

  async sendAfter(
    name: string,
    data: object | null,
    options: Record<string, unknown> | null,
    date: Date
  ): Promise<string> {
    this.jobs.push({
      name,
      data,
      options,
      date
    });

    return `job-${this.jobs.length}`;
  }
}

describe("collection job scheduler", () => {
  test("enqueues one job per tracked product and source without delay splitting", async () => {
    const boss = new FakeBoss();
    const scheduler = new CollectionJobScheduler(
      {
        databaseUrl: "postgresql://test",
        timeoutSeconds: 15,
        maxRetries: 2,
        retryBackoffSeconds: 1,
        requestDelaySeconds: 0.5,
        proxyServer: "http://127.0.0.1:3128",
        proxyUsername: "proxyuser",
        proxyPassword: "proxy-password",
        logLevel: "silent",
        userAgent: "test",
        intervalSeconds: 21600,
        enabledSources: ["kabum", "amazon"]
      },
      {
        trackedProducts: {
          list: async () => [],
          getById: async () => null
        }
      } as never,
      createLogger("silent"),
      ["kabum", "amazon"],
      {
        boss,
        now: () => Date.parse("2026-03-19T18:00:00.000Z")
      }
    );

    const summary = await scheduler.enqueueTrackedProductsForSources([
      {
        id: "prod-1",
        productTitle: "RTX 5070 TI",
        searchTerms: ["RTX", "5070", "TI"],
        active: true,
        createdAt: "2026-03-19T00:00:00.000Z",
        updatedAt: "2026-03-19T00:00:00.000Z"
      },
      {
        id: "prod-2",
        productTitle: "RX 9070 XT",
        searchTerms: ["RX", "9070", "XT"],
        active: true,
        createdAt: "2026-03-19T00:01:00.000Z",
        updatedAt: "2026-03-19T00:01:00.000Z"
      }
    ]);

    expect(summary).toEqual({
      scheduledCount: 4,
      skippedCount: 0
    });
    expect(boss.jobs.map((job) => job.name)).toEqual([
      SEARCH_COLLECTION_JOB_QUEUE,
      SEARCH_COLLECTION_JOB_QUEUE,
      SEARCH_COLLECTION_JOB_QUEUE,
      SEARCH_COLLECTION_JOB_QUEUE
    ]);
    expect(boss.jobs.map((job) => job.date.toISOString())).toEqual([
      "2026-03-19T18:00:00.000Z",
      "2026-03-19T18:00:00.000Z",
      "2026-03-19T18:00:00.000Z",
      "2026-03-19T18:00:00.000Z"
    ]);
    expect(boss.jobs.map((job) => job.options?.singletonKey)).toEqual([
      "prod-1:kabum",
      "prod-1:amazon",
      "prod-2:kabum",
      "prod-2:amazon"
    ]);
  });
});
