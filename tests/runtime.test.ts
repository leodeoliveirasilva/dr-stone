import { describe, expect, test } from "vitest";

import { listKnownSources } from "../dr-stone-database/src/index.js";
import { createLogger } from "../dr-stone-scrapper/src/logger.js";
import { buildSearchSources } from "../dr-stone-scrapper/src/runtime.js";
import type { ScrapperSettings } from "../dr-stone-scrapper/src/types.js";

const baseSettings: ScrapperSettings = {
  databaseUrl: "postgresql://dr_stone:dr_stone@127.0.0.1:15432/dr_stone",
  timeoutSeconds: 15,
  maxRetries: 0,
  retryBackoffSeconds: 0,
  requestDelaySeconds: 0,
  proxyServer: "http://127.0.0.1:3128",
  proxyUsername: "proxyuser",
  proxyPassword: "proxy-password",
  logLevel: "silent",
  userAgent: "test",
  intervalSeconds: 43200,
  enabledSources: ["kabum"]
};

describe("runtime source selection", () => {
  test("can expand from configured sources to all known sources", async () => {
    const logger = createLogger("silent");
    const configuredSources = buildSearchSources(baseSettings, logger);
    const manualSources = buildSearchSources(
      baseSettings,
      logger,
      listKnownSources().map((source) => source.sourceName)
    );

    expect(configuredSources.map((source) => source.sourceName)).toEqual(["kabum"]);
    expect(manualSources.map((source) => source.sourceName)).toEqual([
      "kabum",
      "amazon",
      "pichau"
    ]);

    await Promise.all([...configuredSources, ...manualSources].map((source) => source.close()));
  });
});
