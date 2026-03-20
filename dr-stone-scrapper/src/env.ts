import process from "node:process";

import { normalizeConfiguredSourceNames } from "@dr-stone/database";

import type { ScrapperSettings } from "./types.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

export function loadScrapperSettings(overrides: Partial<ScrapperSettings> = {}): ScrapperSettings {
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const proxyServer = overrides.proxyServer ?? process.env.PROXY_SERVER?.trim();
  if (!proxyServer) {
    throw new Error("PROXY_SERVER is required");
  }
  const proxyUsername = overrides.proxyUsername ?? process.env.PROXY_USER?.trim();
  if (!proxyUsername) {
    throw new Error("PROXY_USER is required");
  }
  const proxyPassword = overrides.proxyPassword ?? process.env.PROXY_PASSWORD?.trim();
  if (!proxyPassword) {
    throw new Error("PROXY_PASSWORD is required");
  }

  const intervalSeconds = overrides.intervalSeconds ?? Number(process.env.INTERVAL_SECONDS ?? "21600");
  const amazonMinIntervalSeconds =
    overrides.amazonMinIntervalSeconds ??
    Number(process.env.AMAZON_MIN_INTERVAL_SECONDS ?? "900");
  const enabledSources = normalizeConfiguredSourceNames(
    overrides.enabledSources ??
      String(process.env.DR_STONE_ENABLED_SOURCES ?? "kabum")
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
    amazonMinIntervalSeconds,
    proxyServer,
    proxyUsername,
    proxyPassword,
    logLevel: overrides.logLevel ?? String(process.env.LOG_LEVEL ?? "info").toLowerCase(),
    userAgent: overrides.userAgent ?? String(process.env.USER_AGENT ?? DEFAULT_USER_AGENT),
    intervalSeconds,
    enabledSources
  };
}
