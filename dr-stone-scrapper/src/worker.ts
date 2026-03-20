import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { loadScrapperSettings } from "./env.js";
import { createLogger } from "./logger.js";
import { buildAllSourcesCollectionService, buildDatabaseServices } from "./runtime.js";
import { CollectionJobScheduler } from "./services/collection-job-scheduler.js";
import type { LoggerLike } from "./types.js";

export async function runWorkerLoop(input: {
  logger: LoggerLike;
  intervalSeconds: number;
  runOnce?: boolean;
  sleepFn?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  scheduleQueuedWork?: () => Promise<{
    scheduledCount: number;
    skippedCount: number;
  }>;
}): Promise<void> {
  const sleepFn = input.sleepFn ?? sleep;
  const now = input.now ?? Date.now;

  while (true) {
    const cycleStarted = now();
    const scheduled =
      (await input.scheduleQueuedWork?.()) ?? {
        scheduledCount: 0,
        skippedCount: 0
      };
    input.logger.info(
      {
        event: "worker_cycle_completed",
        intervalSeconds: input.intervalSeconds,
        scheduledCollectionCount: scheduled.scheduledCount,
        skippedCollectionCount: scheduled.skippedCount
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
  const collectionService = buildAllSourcesCollectionService(settings, logger, database);
  const collectionJobScheduler = new CollectionJobScheduler(
    settings,
    database,
    logger,
    collectionService.getSourceNames(),
    {
      service: collectionService
    }
  );

  try {
    await collectionJobScheduler.start();

    await runWorkerLoop({
      logger,
      intervalSeconds: settings.intervalSeconds,
      runOnce: args.runOnce,
      scheduleQueuedWork: () => collectionJobScheduler.enqueueActiveTrackedProducts()
    });
  } finally {
    await collectionJobScheduler.stop();
    await collectionService.close();
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
