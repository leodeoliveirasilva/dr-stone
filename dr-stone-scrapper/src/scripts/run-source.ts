import process from "node:process";

import { listKnownSources } from "@dr-stone/database";

import { loadScrapperSettings } from "../env.js";
import { createLogger } from "../logger.js";
import { buildSearchSources } from "../runtime.js";

function printUsage(): void {
  const knownSources = listKnownSources()
    .map((source) => source.sourceName)
    .join(", ");
  process.stderr.write(
    [
      "Usage: node dr-stone-scrapper/dist/scripts/run-source.js <source> <search term>",
      `Known sources: ${knownSources}`,
      "",
      "Examples:",
      '  node dr-stone-scrapper/dist/scripts/run-source.js kabum "rtx 4070"',
      '  node dr-stone-scrapper/dist/scripts/run-source.js amazon "echo dot"',
      ""
    ].join("\n")
  );
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  await import("dotenv/config");

  const [sourceName, ...termParts] = argv;
  const searchTerm = termParts.join(" ").trim();

  if (!sourceName || !searchTerm) {
    printUsage();
    return 1;
  }

  const knownSourceNames: string[] = listKnownSources().map((source) => source.sourceName);
  if (!knownSourceNames.includes(sourceName)) {
    process.stderr.write(`Unknown source: ${sourceName}\n`);
    printUsage();
    return 1;
  }

  const settings = loadScrapperSettings({
    databaseUrl: process.env.DATABASE_URL ?? "postgresql://unused/unused",
    enabledSources: [sourceName]
  });

  const logger = createLogger(settings.logLevel);
  const sources = buildSearchSources(settings, logger, [sourceName]);
  const source = sources[0];

  if (!source) {
    process.stderr.write(`Source "${sourceName}" is known but not wired in runtime.\n`);
    return 1;
  }

  logger.info(
    {
      event: "run_source_started",
      source: source.sourceName,
      strategy: source.strategy,
      searchTerm,
      proxyConfigured: Boolean(settings.proxyServer)
    },
    "run_source_started"
  );

  try {
    const started = Date.now();
    const result = await source.search(searchTerm);
    const elapsedMs = Date.now() - started;

    logger.info(
      {
        event: "run_source_succeeded",
        source: source.sourceName,
        searchTerm,
        totalResults: result.totalResults,
        itemCount: result.items.length,
        pageCount: result.pageCount,
        elapsedMs
      },
      "run_source_succeeded"
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    logger.error(
      {
        event: "run_source_failed",
        source: source.sourceName,
        searchTerm,
        errorMessage: error instanceof Error ? error.message : String(error)
      },
      "run_source_failed"
    );
    return 1;
  } finally {
    await source.close();
  }
}

const entryPoint = process.argv[1] ?? "";
if (entryPoint.endsWith("run-source.js")) {
  main().then(
    (exitCode) => {
      process.exitCode = exitCode;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  );
}
