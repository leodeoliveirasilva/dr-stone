import process from "node:process";

import { listKnownSources, normalizeConfiguredSourceNames } from "@dr-stone/database";

import type { ScrapperSettings } from "./types.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

export function loadScrapperSettings(overrides: Partial<ScrapperSettings> = {}): ScrapperSettings {
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  // Proxy is currently disabled. Leaving the plumbing in place so it can be
  // re-enabled by simply setting PROXY_SERVER / PROXY_USER / PROXY_PASSWORD.
  // When any proxy env var is empty, browser-backed sources route requests
  // directly (see buildBrowserLaunchOptions in src/browser/playwright.ts).
  const proxyServer = overrides.proxyServer ?? process.env.PROXY_SERVER?.trim() ?? "";
  const proxyUsername = overrides.proxyUsername ?? process.env.PROXY_USER?.trim() ?? "";
  const proxyPassword = overrides.proxyPassword ?? process.env.PROXY_PASSWORD?.trim() ?? "";
  // Per-source opt-out: sources listed here route directly even when the
  // global proxy is configured. Sources without proxy support ignore this.
  // Default disables every known source — set the env var explicitly (even
  // to an empty string) to opt sources back into the proxy.
  const proxyDisabledSourcesRaw = process.env.DR_STONE_PROXY_DISABLED_SOURCES;
  const proxyDisabledSources =
    overrides.proxyDisabledSources ??
    (proxyDisabledSourcesRaw === undefined
      ? listKnownSources().map((source) => source.sourceName)
      : proxyDisabledSourcesRaw
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean));

  const intervalSeconds = overrides.intervalSeconds ?? Number(process.env.INTERVAL_SECONDS ?? "43200");
  // Browser-backed sources abort image/font/media requests by default to keep
  // proxy bandwidth low. Listings parse from HTML/anchor tags, so blocking
  // these resource types does not affect extraction. Set to "false" to opt
  // out (e.g. while debugging anti-bot detection).
  const blockHeavyResourcesRaw = process.env.DR_STONE_BLOCK_HEAVY_RESOURCES?.trim().toLowerCase();
  const blockHeavyResources =
    overrides.blockHeavyResources ??
    (blockHeavyResourcesRaw === undefined ? true : blockHeavyResourcesRaw !== "false" && blockHeavyResourcesRaw !== "0");
  const enabledSources = normalizeConfiguredSourceNames(
    overrides.enabledSources ??
      String(process.env.DR_STONE_ENABLED_SOURCES ?? "kabum,amazon,pichau,mercadolivre")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
  );

  return {
    databaseUrl,
    timeoutSeconds: overrides.timeoutSeconds ?? Number(process.env.TIMEOUT_SECONDS ?? "15"),
    maxRetries: overrides.maxRetries ?? Number(process.env.MAX_RETRIES ?? "2"),
    retryBackoffSeconds:
      overrides.retryBackoffSeconds ?? Number(process.env.RETRY_BACKOFF_SECONDS ?? "1"),
    requestDelaySeconds:
      overrides.requestDelaySeconds ?? Number(process.env.REQUEST_DELAY_SECONDS ?? "0.5"),
    proxyServer,
    proxyUsername,
    proxyPassword,
    proxyDisabledSources,
    logLevel: overrides.logLevel ?? String(process.env.LOG_LEVEL ?? "info").toLowerCase(),
    userAgent: overrides.userAgent ?? String(process.env.USER_AGENT ?? DEFAULT_USER_AGENT),
    intervalSeconds,
    enabledSources,
    blockHeavyResources
  };
}
