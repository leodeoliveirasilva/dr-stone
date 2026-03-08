ALTER TABLE tracked_products
ADD COLUMN search_terms_json TEXT;

UPDATE tracked_products
SET source_name = 'all'
WHERE source_name IS NOT NULL;

DROP INDEX IF EXISTS idx_tracked_products_source_title_term;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_products_title_terms
ON tracked_products (product_title, search_terms_json);
