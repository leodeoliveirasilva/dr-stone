import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema, scrapeFailures } from "../schema.js";
import type { ScrapeFailure } from "../types.js";
import { newId } from "../utils.js";

type Database = NodePgDatabase<typeof schema>;

export class ScrapeFailuresRepository {
  constructor(private readonly db: Database) {}

  async record(
    failure: ScrapeFailure,
    options: { searchRunId?: string | null } = {}
  ): Promise<string> {
    const failureId = newId();

    await this.db.insert(scrapeFailures).values({
      id: failureId,
      searchRunId: options.searchRunId ?? null,
      sourceName: failure.source,
      stage: failure.stage,
      errorCode: failure.errorCode,
      errorType: failure.errorType,
      message: failure.message,
      retriable: failure.retriable ? 1 : 0,
      httpStatus: failure.httpStatus ?? null,
      targetUrl: failure.targetUrl,
      finalUrl: failure.finalUrl ?? null,
      detailsJson: JSON.stringify(failure.details),
      capturedAt: failure.capturedAt
    });

    return failureId;
  }
}
