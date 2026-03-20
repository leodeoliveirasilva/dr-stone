import {
  applyMigrations,
  createDatabaseServices,
  normalizeConfiguredSourceNames
} from "@dr-stone/database";

import { HttpFetcher } from "./http/http-fetcher.js";
import { AmazonSource } from "./sources/amazon/amazon-source.js";
import { KabumSource } from "./sources/kabum/kabum-source.js";
import type { LoggerLike, ScrapperSettings, SearchSource } from "./types.js";
import { SearchCollectionService } from "./services/search-collection-service.js";

export async function buildDatabaseServices(settings: ScrapperSettings) {
  const database = createDatabaseServices(settings.databaseUrl);
  await applyMigrations(database.pool);
  return database;
}

export function buildSearchSources(
  settings: ScrapperSettings,
  logger: LoggerLike
): SearchSource[] {
  const enabled = new Set(normalizeConfiguredSourceNames(settings.enabledSources));
  const sources: SearchSource[] = [];

  if (enabled.has("kabum")) {
    sources.push(new KabumSource(new HttpFetcher(settings, logger), logger));
  }

  if (enabled.has("amazon")) {
    sources.push(new AmazonSource(settings, logger));
  }

  return sources;
}

export function buildCollectionService(
  settings: ScrapperSettings,
  logger: LoggerLike,
  database = createDatabaseServices(settings.databaseUrl)
): SearchCollectionService {
  return new SearchCollectionService(database, buildSearchSources(settings, logger), logger);
}
