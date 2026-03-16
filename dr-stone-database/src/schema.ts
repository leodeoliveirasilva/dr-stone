import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const trackedProducts = pgTable("tracked_products", {
  id: text("id").primaryKey(),
  sourceName: text("source_name").notNull(),
  productTitle: text("product_title").notNull(),
  searchTerm: text("search_term").notNull(),
  searchTermsJson: text("search_terms_json"),
  scrapesPerDay: integer("scrapes_per_day").notNull().default(4),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const searchRuns = pgTable("search_runs", {
  id: text("id").primaryKey(),
  trackedProductId: text("tracked_product_id").notNull(),
  sourceName: text("source_name").notNull(),
  searchTerm: text("search_term").notNull(),
  searchUrl: text("search_url").notNull(),
  status: text("status").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  durationMs: integer("duration_ms"),
  totalResults: integer("total_results"),
  matchedResults: integer("matched_results"),
  pageCount: integer("page_count"),
  message: text("message"),
  createdAt: text("created_at").notNull()
});

export const searchRunItems = pgTable("search_run_items", {
  id: text("id").primaryKey(),
  searchRunId: text("search_run_id").notNull(),
  trackedProductId: text("tracked_product_id").notNull(),
  sourceName: text("source_name").notNull(),
  productTitle: text("product_title").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  sourceProductKey: text("source_product_key"),
  sellerName: text("seller_name"),
  priceValue: text("price_value").notNull(),
  currency: text("currency").notNull(),
  availability: text("availability").notNull(),
  isAvailable: integer("is_available").notNull(),
  position: integer("position").notNull(),
  capturedAt: text("captured_at").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const scrapeFailures = pgTable("scrape_failures", {
  id: text("id").primaryKey(),
  searchRunId: text("search_run_id"),
  sourceName: text("source_name").notNull(),
  stage: text("stage").notNull(),
  errorCode: text("error_code").notNull(),
  errorType: text("error_type").notNull(),
  message: text("message").notNull(),
  retriable: integer("retriable").notNull(),
  httpStatus: integer("http_status"),
  targetUrl: text("target_url").notNull(),
  finalUrl: text("final_url"),
  detailsJson: text("details_json").notNull(),
  capturedAt: text("captured_at").notNull()
});

export const schema = {
  trackedProducts,
  searchRuns,
  searchRunItems,
  scrapeFailures
};
