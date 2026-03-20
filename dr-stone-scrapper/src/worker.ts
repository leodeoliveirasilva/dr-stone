import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { loadScrapperSettings } from "./env.js";
import { createLogger } from "./logger.js";
import { buildSearchSources, buildDatabaseServices } from "./runtime.js";
import { AmazonJobScheduler } from "./services/amazon-job-scheduler.js";
import { SearchCollectionService } from "./services/search-collection-service.js";
import type { LoggerLike } from "./types.js";

export async function runWorkerLoop(input: {
  collector: {
    collectAllActive(): Promise<unknown[]>;
  };
  logger: LoggerLike;
  intervalSeconds: number;
  runOnce?: boolean;
  sleepFn?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  scheduleDeferredWork?: () => Promise<{
    scheduledCount: number;
    skippedCount: number;
  }>;
}): Promise<void> {
  const sleepFn = input.sleepFn ?? sleep;
  const now = input.now ?? Date.now;

  while (true) {
    const cycleStarted = now();
    const scheduled =
      (await input.scheduleDeferredWork?.()) ?? {
        scheduledCount: 0,
        skippedCount: 0
      };
    const results = await input.collector.collectAllActive();
    input.logger.info(
      {
        event: "worker_cycle_completed",
        intervalSeconds: input.intervalSeconds,
        collectedCount: results.length,
        scheduledAmazonCount: scheduled.scheduledCount,
        skippedAmazonCount: scheduled.skippedCount
      },
      "worker_cycle_completed"
    );

    if (input.runOnce) {
      return;
    }

    const elapsedMilliseconds = now() - cycleStarted;
    const sleepMilliseconds = Math.max(0, input.intervalSeconds * 1000 - elapsedMilliseconds);
    input.logger.info(
      {
        event: "worker_sleep_scheduled",
        intervalSeconds: input.intervalSeconds,
        sleepSeconds: sleepMilliseconds / 1000
      },
      "worker_sleep_scheduled"
    );
    await sleepFn(sleepMilliseconds);
  }
}

function parseArgs(argv: string[]) {
  const runOnce = argv.includes("--run-once");
  const intervalFlagIndex = argv.indexOf("--interval-seconds");
  const intervalSeconds =
    intervalFlagIndex >= 0 ? Number(argv[intervalFlagIndex + 1]) : undefined;

  return {
    runOnce,
    intervalSeconds
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  await import("dotenv/config");
  const args = parseArgs(argv);
  if (args.intervalSeconds !== undefined && args.intervalSeconds <= 0) {
    throw new Error("interval-seconds must be a positive integer");
  }

  const configuredSources = process.env.DR_STONE_ENABLED_SOURCES;
  const settings = loadScrapperSettings({
    intervalSeconds: args.intervalSeconds
  });

  if (settings.intervalSeconds <= 0) {
    throw new Error("interval-seconds must be a positive integer");
  }

  const logger = createLogger(settings.logLevel);
  logger.info(
    {
      event: "worker_started",
      runOnce: args.runOnce,
      intervalSeconds: settings.intervalSeconds,
      enabledSources: settings.enabledSources,
      sourceConfiguration: configuredSources ? "environment" : "default"
    },
    "worker_started"
  );

  if (!configuredSources) {
    logger.warn(
      {
        event: "worker_default_sources_used",
        defaultEnabledSources: settings.enabledSources,
        environmentVariable: "DR_STONE_ENABLED_SOURCES"
      },
      "worker_default_sources_used"
    );
  }

  const database = await buildDatabaseServices(settings);
  const searchSources = buildSearchSources(settings, logger);
  const immediateSources = searchSources.filter((source) => source.sourceName !== "amazon");
  const amazonSources = searchSources.filter((source) => source.sourceName === "amazon");
  const collector =
    immediateSources.length > 0
      ? new SearchCollectionService(database, immediateSources, logger)
      : {
          collectAllActive: async () => []
        };
  const amazonService =
    amazonSources.length > 0
      ? new SearchCollectionService(database, amazonSources, logger)
      : null;
  const amazonScheduler =
    amazonService && amazonSources.length > 0
      ? new AmazonJobScheduler(settings, database, amazonService, logger)
      : null;

  logger.info(
    {
      event: "worker_sources_partitioned",
      immediateSources: immediateSources.map((source) => source.sourceName),
      deferredSources: amazonSources.map((source) => source.sourceName),
      amazonMinIntervalSeconds: settings.amazonMinIntervalSeconds
    },
    "worker_sources_partitioned"
  );

  try {
    if (amazonScheduler) {
      await amazonScheduler.start();
    }

    await runWorkerLoop({
      collector,
      logger,
      intervalSeconds: settings.intervalSeconds,
      runOnce: args.runOnce,
      scheduleDeferredWork: amazonScheduler
        ? () => amazonScheduler.scheduleActiveTrackedProducts()
        : undefined
    });
  } finally {
    await amazonScheduler?.stop();
    if (collector instanceof SearchCollectionService) {
      await collector.close();
    }
    await amazonService?.close();
    await database.close();
  }

  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("worker.js")) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
