import {
  applyMigrations,
  createDatabaseServices,
  listKnownSources,
  listRegisteredSources
} from "@dr-stone/database";
import { CollectionJobScheduler, createLogger } from "@dr-stone/scrapper";

import type { ApiSettings } from "../env.js";

export async function buildRuntime(settings: ApiSettings) {
  const logger = createLogger(settings.scrapper.logLevel);
  const database = createDatabaseServices(settings.scrapper.databaseUrl);
  await applyMigrations(database.pool);
  const collectionJobScheduler = new CollectionJobScheduler(
    settings.scrapper,
    database,
    logger,
    listKnownSources().map((source) => source.sourceName)
  );
  await collectionJobScheduler.start({ work: false });

  return {
    logger,
    database,
    collectionJobScheduler,
    sources: listRegisteredSources(settings.scrapper.enabledSources)
  };
}
