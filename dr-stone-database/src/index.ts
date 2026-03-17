import type { Pool } from "pg";

import { applyMigrations, createDb, createPool } from "./client/database.js";
import { PriceHistoryRepository } from "./repositories/price-history.js";
import { ScrapeFailuresRepository } from "./repositories/scrape-failures.js";
import { SearchRunsRepository } from "./repositories/search-runs.js";
import { TrackedProductsRepository } from "./repositories/tracked-products.js";

export * from "./client/database.js";
export * from "./schema.js";
export * from "./sources.js";
export * from "./types.js";
export * from "./utils.js";

export interface DatabaseServices {
  pool: Pool;
  trackedProducts: TrackedProductsRepository;
  searchRuns: SearchRunsRepository;
  priceHistory: PriceHistoryRepository;
  scrapeFailures: ScrapeFailuresRepository;
  close: () => Promise<void>;
}

export function createDatabaseServices(databaseUrl: string): DatabaseServices {
  const pool = createPool(databaseUrl);
  const db = createDb(pool);

  return {
    pool,
    trackedProducts: new TrackedProductsRepository(db),
    searchRuns: new SearchRunsRepository(db),
    priceHistory: new PriceHistoryRepository(db),
    scrapeFailures: new ScrapeFailuresRepository(db),
    close: () => pool.end()
  };
}

export { applyMigrations };
