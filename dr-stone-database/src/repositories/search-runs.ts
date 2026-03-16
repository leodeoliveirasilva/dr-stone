import { desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema, searchRunItems, searchRuns, trackedProducts } from "../schema.js";
import type { SearchResultItem } from "../types.js";
import { newId, utcNow } from "../utils.js";

type Database = NodePgDatabase<typeof schema>;

interface SearchRunItemRow {
  search_run_id: string;
  product_title: string;
  canonical_url: string;
  price_value: string;
  currency: string;
  seller_name: string | null;
  availability: string;
  is_available: number;
  position: number;
  captured_at: string;
}

export class SearchRunsRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    trackedProductId: string;
    sourceName: string;
    searchTerm: string;
    searchUrl: string;
  }): Promise<string> {
    const searchRunId = newId();
    const timestamp = utcNow();

    await this.db.insert(searchRuns).values({
      id: searchRunId,
      trackedProductId: input.trackedProductId,
      sourceName: input.sourceName,
      searchTerm: input.searchTerm,
      searchUrl: input.searchUrl,
      status: "running",
      startedAt: timestamp,
      createdAt: timestamp
    });

    return searchRunId;
  }

  async finish(
    searchRunId: string,
    input: {
      status: string;
      totalResults?: number | null;
      matchedResults?: number | null;
      pageCount?: number | null;
      message?: string | null;
    }
  ): Promise<void> {
    const startedRow = await this.db.query.searchRuns.findFirst({
      where: eq(searchRuns.id, searchRunId),
      columns: {
        startedAt: true
      }
    });

    const finishedAt = new Date().toISOString();
    const durationMs = startedRow
      ? Math.round(
          new Date(finishedAt).getTime() - new Date(startedRow.startedAt).getTime()
        )
      : null;

    await this.db
      .update(searchRuns)
      .set({
        status: input.status,
        finishedAt,
        durationMs,
        totalResults: input.totalResults ?? null,
        matchedResults: input.matchedResults ?? null,
        pageCount: input.pageCount ?? null,
        message: input.message ?? null
      })
      .where(eq(searchRuns.id, searchRunId));
  }

  async persistItems(input: {
    searchRunId: string;
    trackedProductId: string;
    items: SearchResultItem[];
    capturedAt: string;
  }): Promise<number> {
    if (input.items.length === 0) {
      return 0;
    }

    await this.db.insert(searchRunItems).values(
      input.items.map((item) => ({
        id: newId(),
        searchRunId: input.searchRunId,
        trackedProductId: input.trackedProductId,
        sourceName: item.source,
        productTitle: item.title,
        canonicalUrl: item.canonicalUrl,
        sourceProductKey:
          typeof item.metadata.source_product_key === "string"
            ? item.metadata.source_product_key
            : null,
        sellerName:
          typeof item.metadata.seller_name === "string"
            ? item.metadata.seller_name
            : null,
        priceValue: item.price,
        currency: item.currency,
        availability: item.availability,
        isAvailable: item.isAvailable ? 1 : 0,
        position: item.position,
        capturedAt: input.capturedAt,
        metadataJson: JSON.stringify(item.metadata),
        createdAt: utcNow()
      }))
    );

    return input.items.length;
  }

  async list(options: {
    date?: string | null;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const limit = options.limit ?? 40;

    const runsQuery = this.db
      .select({
        id: searchRuns.id,
        tracked_product_id: searchRuns.trackedProductId,
        source_name: searchRuns.sourceName,
        search_term: searchRuns.searchTerm,
        search_url: searchRuns.searchUrl,
        status: searchRuns.status,
        started_at: searchRuns.startedAt,
        finished_at: searchRuns.finishedAt,
        duration_ms: searchRuns.durationMs,
        total_results: searchRuns.totalResults,
        matched_results: searchRuns.matchedResults,
        page_count: searchRuns.pageCount,
        message: searchRuns.message,
        created_at: searchRuns.createdAt,
        tracked_product_title: trackedProducts.productTitle,
        tracked_product_active: trackedProducts.active
      })
      .from(searchRuns)
      .leftJoin(trackedProducts, eq(trackedProducts.id, searchRuns.trackedProductId))
      .orderBy(desc(searchRuns.startedAt))
      .limit(limit);

    const runs = options.date
      ? await runsQuery.where(
          sql`CAST(${searchRuns.startedAt} AS DATE) = ${options.date}`
        )
      : await runsQuery;

    if (runs.length === 0) {
      return [];
    }

    const runIds = runs.map((run) => run.id);
    const items = await this.db
      .select({
        search_run_id: searchRunItems.searchRunId,
        product_title: searchRunItems.productTitle,
        canonical_url: searchRunItems.canonicalUrl,
        price_value: searchRunItems.priceValue,
        currency: searchRunItems.currency,
        seller_name: searchRunItems.sellerName,
        availability: searchRunItems.availability,
        is_available: searchRunItems.isAvailable,
        position: searchRunItems.position,
        captured_at: searchRunItems.capturedAt
      })
      .from(searchRunItems)
      .where(inArray(searchRunItems.searchRunId, runIds))
      .orderBy(
        desc(searchRunItems.capturedAt),
        sql`CAST(${searchRunItems.priceValue} AS NUMERIC) ASC`,
        searchRunItems.position
      );

    const groupedItems = new Map<string, SearchRunItemRow[]>();
    for (const item of items) {
      const bucket = groupedItems.get(item.search_run_id) ?? [];
      bucket.push(item);
      groupedItems.set(item.search_run_id, bucket);
    }

    return runs.map((row) => ({
      ...row,
      tracked_product_active:
        row.tracked_product_active === null ? null : row.tracked_product_active === 1,
      items:
        groupedItems.get(row.id)?.map((item) => ({
          ...item,
          is_available: item.is_available === 1
        })) ?? []
    }));
  }
}
