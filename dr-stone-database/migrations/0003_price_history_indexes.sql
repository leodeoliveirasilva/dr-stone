CREATE INDEX IF NOT EXISTS idx_search_run_items_tracked_captured_price
ON search_run_items (tracked_product_id, captured_at, price_value);
