import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { loadScrapperSettings } from "./env.js";
import { createLogger } from "./logger.js";
import { buildSearchSources, buildDatabaseServices } from "./runtime.js";
import { SearchCollectionService } from "./services/search-collection-service.js";
import type { LoggerLike } from "./types.js";

export async function runWorkerLoop(input: {
  service: SearchCollectionService;
  logger: LoggerLike;
  intervalSeconds: number;
  runOnce?: boolean;
  sleepFn?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}): Promise<void> {
  const sleepFn = input.sleepFn ?? sleep;
  const now = input.now ?? Date.now;

  while (true) {
    const cycleStarted = now();
    const results = await input.service.collectAllActive();
    input.logger.info(
      {
        event: "worker_cycle_completed",
        intervalSeconds: input.intervalSeconds,
        collectedCount: results.length
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
  const args = parseArgs(argv);
  if (args.intervalSeconds !== undefined && args.intervalSeconds <= 0) {
    throw new Error("interval-seconds must be a positive integer");
  }

  const settings = loadScrapperSettings({
    intervalSeconds: args.intervalSeconds
  });

  if (settings.intervalSeconds <= 0) {
    throw new Error("interval-seconds must be a positive integer");
  }

  const logger = createLogger(settings.logLevel);
  const database = await buildDatabaseServices(settings);
  const service = new SearchCollectionService(
    database,
    buildSearchSources(settings, logger),
    logger
  );

  try {
    await runWorkerLoop({
      service,
      logger,
      intervalSeconds: settings.intervalSeconds,
      runOnce: args.runOnce
    });
  } finally {
    await service.close();
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
