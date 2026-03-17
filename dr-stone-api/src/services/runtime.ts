import {
  applyMigrations,
  createDatabaseServices,
  listRegisteredSources
} from "@dr-stone/database";
import { SearchCollectionService, buildSearchSources, createLogger } from "@dr-stone/scrapper";

import type { ApiSettings } from "../env.js";

export async function buildRuntime(settings: ApiSettings) {
  const logger = createLogger(settings.scrapper.logLevel);
  const database = createDatabaseServices(settings.scrapper.databaseUrl);
  await applyMigrations(database.pool);
  const collectionService = new SearchCollectionService(
    database,
    buildSearchSources(settings.scrapper, logger),
    logger
  );

  return {
    logger,
    database,
    collectionService,
    sources: listRegisteredSources(settings.scrapper.enabledSources)
  };
}
