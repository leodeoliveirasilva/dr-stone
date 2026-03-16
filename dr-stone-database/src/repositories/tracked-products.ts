import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { schema, trackedProducts } from "../schema.js";
import type { TrackedProduct } from "../types.js";
import {
  DEFAULT_RUNS_PER_DAY,
  asBoolean,
  buildSearchQuery,
  newId,
  normalizeSearchTerms,
  parseSearchTermsRow,
  utcNow
} from "../utils.js";

type Database = NodePgDatabase<typeof schema>;

export class TrackedProductsRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    productTitle: string;
    searchTerms: string[];
    active?: boolean;
  }): Promise<TrackedProduct> {
    const searchTerms = normalizeSearchTerms(input.searchTerms);
    const trackedProductId = newId();
    const timestamp = utcNow();

    await this.db.insert(trackedProducts).values({
      id: trackedProductId,
      sourceName: "all",
      productTitle: input.productTitle,
      searchTerm: buildSearchQuery(searchTerms),
      searchTermsJson: JSON.stringify(searchTerms),
      scrapesPerDay: DEFAULT_RUNS_PER_DAY,
      active: input.active === false ? 0 : 1,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const trackedProduct = await this.getById(trackedProductId);
    if (!trackedProduct) {
      throw new Error(`Tracked product not found after insert: ${trackedProductId}`);
    }

    return trackedProduct;
  }

  async list(options: { activeOnly?: boolean } = {}): Promise<TrackedProduct[]> {
    const query = this.db.select().from(trackedProducts).orderBy(asc(trackedProducts.createdAt));
    const rows =
      options.activeOnly === false
        ? await query
        : await query.where(eq(trackedProducts.active, 1));

    return rows.map((row) => this.mapRow(row));
  }

  async listDue(): Promise<TrackedProduct[]> {
    return this.list({ activeOnly: true });
  }

  async getById(id: string): Promise<TrackedProduct | null> {
    const row = await this.db.query.trackedProducts.findFirst({
      where: eq(trackedProducts.id, id)
    });

    return row ? this.mapRow(row) : null;
  }

  async update(
    id: string,
    input: {
      productTitle: string;
      searchTerms: string[];
      active: boolean;
    }
  ): Promise<TrackedProduct | null> {
    const searchTerms = normalizeSearchTerms(input.searchTerms);

    await this.db
      .update(trackedProducts)
      .set({
        sourceName: "all",
        productTitle: input.productTitle,
        searchTerm: buildSearchQuery(searchTerms),
        searchTermsJson: JSON.stringify(searchTerms),
        scrapesPerDay: DEFAULT_RUNS_PER_DAY,
        active: input.active ? 1 : 0,
        updatedAt: utcNow()
      })
      .where(eq(trackedProducts.id, id));

    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(trackedProducts)
      .where(eq(trackedProducts.id, id))
      .returning({ id: trackedProducts.id });

    return deleted.length > 0;
  }

  private mapRow(row: typeof trackedProducts.$inferSelect): TrackedProduct {
    return {
      id: row.id,
      productTitle: row.productTitle,
      searchTerms: parseSearchTermsRow({
        searchTermsJson: row.searchTermsJson,
        searchTerm: row.searchTerm
      }),
      active: asBoolean(row.active),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }
}
