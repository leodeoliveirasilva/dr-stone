import { describe, expect, test } from "vitest";

import {
  AMAZON_JOB_QUEUE,
  AmazonJobScheduler
} from "../dr-stone-scrapper/src/services/amazon-job-scheduler.js";
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

describe("amazon job scheduler", () => {
  test("schedules tracked products 15 minutes apart", async () => {
    const boss = new FakeBoss();
    const scheduler = new AmazonJobScheduler(
      {
        databaseUrl: "postgresql://test",
        timeoutSeconds: 15,
        maxRetries: 2,
        retryBackoffSeconds: 1,
        requestDelaySeconds: 0.5,
        amazonMinIntervalSeconds: 900,
        proxyServer: "http://127.0.0.1:3128",
        proxyUsername: "proxyuser",
        proxyPassword: "proxy-password",
        logLevel: "silent",
        userAgent: "test",
        intervalSeconds: 21600,
        enabledSources: ["amazon"]
      },
      {
        trackedProducts: {
          list: async () => [],
          getById: async () => null
        }
      } as never,
      {
        collectTrackedProduct: async () => ({
          trackedProductId: "prod-1",
          searchRunIds: [],
          successfulRuns: 1,
          failedRuns: 0,
          totalResults: 1,
          matchedResults: 1,
          pageCount: 1
        })
      } as never,
      createLogger("silent"),
      {
        boss,
        now: () => Date.parse("2026-03-19T18:00:00.000Z")
      }
    );

    const summary = await scheduler.scheduleTrackedProducts([
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
      },
      {
        id: "prod-3",
        productTitle: "RTX 5090",
        searchTerms: ["RTX", "5090"],
        active: true,
        createdAt: "2026-03-19T00:02:00.000Z",
        updatedAt: "2026-03-19T00:02:00.000Z"
      }
    ]);

    expect(summary).toEqual({
      scheduledCount: 3,
      skippedCount: 0
    });
    expect(boss.jobs.map((job) => job.name)).toEqual([
      AMAZON_JOB_QUEUE,
      AMAZON_JOB_QUEUE,
      AMAZON_JOB_QUEUE
    ]);
    expect(boss.jobs.map((job) => job.date.toISOString())).toEqual([
      "2026-03-19T18:00:00.000Z",
      "2026-03-19T18:15:00.000Z",
      "2026-03-19T18:30:00.000Z"
    ]);
    expect(
      boss.jobs.map((job) => job.options?.singletonKey)
    ).toEqual(["prod-1", "prod-2", "prod-3"]);
  });
});
