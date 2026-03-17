import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema } from "../schema.js";
import type { PeriodMinimumPriceEntry, SearchHistoryEntry } from "../types.js";

type Database = NodePgDatabase<typeof schema>;

interface SearchHistoryRow extends Record<string, unknown> {
  captured_at: string;
  product_title: string;
  canonical_url: string;
  price_value: string;
  currency: string;
  seller_name: string | null;
  search_run_id: string;
  source_name: string;
}

interface PeriodMinimumRow extends SearchHistoryRow {
  period_start: string;
}

export class PriceHistoryRepository {
  constructor(private readonly db: Database) {}

  async listHistory(input: {
    trackedProductId: string;
    limit?: number;
    offset?: number;
    startAt?: string | null;
    endAt?: string | null;
    sourceName?: string | null;
  }): Promise<SearchHistoryEntry[]> {
    const rows = await this.db.execute<SearchHistoryRow>(sql`
      SELECT
        captured_at,
        product_title,
        canonical_url,
        price_value,
        currency,
        seller_name,
        search_run_id,
        source_name
      FROM search_run_items
      WHERE tracked_product_id = ${input.trackedProductId}
      ${input.startAt ? sql`AND captured_at >= ${input.startAt}` : sql``}
      ${input.endAt ? sql`AND captured_at <= ${input.endAt}` : sql``}
      ${input.sourceName ? sql`AND source_name = ${input.sourceName}` : sql``}
      ORDER BY captured_at DESC, CAST(price_value AS NUMERIC) ASC, canonical_url ASC, search_run_id ASC
      LIMIT ${input.limit ?? 100}
      OFFSET ${input.offset ?? 0}
    `);

    return rows.rows.map((row: SearchHistoryRow) => ({
      capturedAt: normalizeTimestampOutput(row.captured_at),
      productTitle: row.product_title,
      canonicalUrl: row.canonical_url,
      price: row.price_value,
      currency: row.currency,
      sellerName: row.seller_name,
      searchRunId: row.search_run_id,
      sourceName: row.source_name
    }));
  }

  async listPeriodMinimums(input: {
    trackedProductId: string;
    period: "day" | "week" | "month";
    startAt: string;
    endAt: string;
    sourceName?: string | null;
  }): Promise<PeriodMinimumPriceEntry[]> {
    const periodExpression = this.periodExpression(input.period);

    const rows = await this.db.execute<PeriodMinimumRow>(sql`
      WITH candidate_items AS (
        SELECT
          ${sql.raw(periodExpression)} AS period_start,
          source_name,
          captured_at,
          product_title,
          canonical_url,
          price_value,
          currency,
          seller_name,
          search_run_id
        FROM search_run_items
        WHERE tracked_product_id = ${input.trackedProductId}
          AND captured_at >= ${input.startAt}
          AND captured_at <= ${input.endAt}
          ${input.sourceName ? sql`AND source_name = ${input.sourceName}` : sql``}
      ),
      ranked_items AS (
        SELECT
          period_start,
          source_name,
          captured_at,
          product_title,
          canonical_url,
          price_value,
          currency,
          seller_name,
          search_run_id,
          ROW_NUMBER() OVER (
            PARTITION BY source_name, period_start
            ORDER BY CAST(price_value AS NUMERIC) ASC, captured_at ASC, canonical_url ASC, search_run_id ASC
          ) AS row_number
        FROM candidate_items
      )
      SELECT
        period_start,
        source_name,
        captured_at,
        product_title,
        canonical_url,
        price_value,
        currency,
        seller_name,
        search_run_id
      FROM ranked_items
      WHERE row_number = 1
      ORDER BY source_name ASC, period_start ASC
    `);

    return rows.rows.map((row: PeriodMinimumRow) => ({
      periodStart: normalizeTimestampOutput(row.period_start),
      capturedAt: normalizeTimestampOutput(row.captured_at),
      productTitle: row.product_title,
      canonicalUrl: row.canonical_url,
      price: row.price_value,
      currency: row.currency,
      sellerName: row.seller_name,
      searchRunId: row.search_run_id,
      sourceName: row.source_name
    }));
  }

  private periodExpression(period: "day" | "week" | "month"): string {
    switch (period) {
      case "day":
        return "date_trunc('day', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
      case "week":
        return "date_trunc('week', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
      case "month":
        return "date_trunc('month', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'";
    }
  }
}
import { normalizeTimestampOutput } from "../utils.js";
