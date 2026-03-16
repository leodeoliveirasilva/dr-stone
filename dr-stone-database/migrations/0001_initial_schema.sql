CREATE TABLE IF NOT EXISTS tracked_products (
    id TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    product_title TEXT NOT NULL,
    search_term TEXT NOT NULL,
    scrapes_per_day INTEGER NOT NULL DEFAULT 4,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_products_source_title_term
ON tracked_products (source_name, product_title, search_term);

CREATE TABLE IF NOT EXISTS search_runs (
    id TEXT PRIMARY KEY,
    tracked_product_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    search_term TEXT NOT NULL,
    search_url TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    total_results INTEGER,
    matched_results INTEGER,
    page_count INTEGER,
    message TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (tracked_product_id) REFERENCES tracked_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_search_runs_tracked_started
ON search_runs (tracked_product_id, started_at DESC);

CREATE TABLE IF NOT EXISTS search_run_items (
    id TEXT PRIMARY KEY,
    search_run_id TEXT NOT NULL,
    tracked_product_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    product_title TEXT NOT NULL,
    canonical_url TEXT NOT NULL,
    source_product_key TEXT,
    seller_name TEXT,
    price_value TEXT NOT NULL,
    currency TEXT NOT NULL,
    availability TEXT NOT NULL,
    is_available INTEGER NOT NULL,
    position INTEGER NOT NULL,
    captured_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (search_run_id) REFERENCES search_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (tracked_product_id) REFERENCES tracked_products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_search_run_items_tracked_time
ON search_run_items (tracked_product_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS scrape_failures (
    id TEXT PRIMARY KEY,
    search_run_id TEXT,
    source_name TEXT NOT NULL,
    stage TEXT NOT NULL,
    error_code TEXT NOT NULL,
    error_type TEXT NOT NULL,
    message TEXT NOT NULL,
    retriable INTEGER NOT NULL,
    http_status INTEGER,
    target_url TEXT NOT NULL,
    final_url TEXT,
    details_json TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    FOREIGN KEY (search_run_id) REFERENCES search_runs(id) ON DELETE SET NULL
);
