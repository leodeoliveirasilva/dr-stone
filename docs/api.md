# API Reference

## Overview

Tracked products are source-agnostic.

- Register `1..5` `search_terms` for each tracked product.
- The collector joins those terms into one source query.
- Every tracked product is collected from every registered source adapter in the project.
- A scraped item matches only when its title contains all tracked search terms, case-insensitively.
- Collection cadence is global and is not configured per tracked product.

## Endpoints

### `GET /`

Returns:

```json
{"name":"dr-stone-api","status":"ok"}
```

### `GET /health`

Returns:

```json
{"status":"ok"}
```

### `GET /tracked-products`

Query params:

- `all=1` includes inactive tracked products.

Returns an array of tracked products:

```json
[
  {
    "id": "0d95d62b8f72457d9cd8d5d2c0f7b62f",
    "title": "RX 9070 XT Sapphire",
    "search_terms": ["RX 9070 XT", "Sapphire"],
    "active": true,
    "created_at": "2026-03-08T12:00:00+00:00",
    "updated_at": "2026-03-08T12:00:00+00:00"
  }
]
```

### `POST /tracked-products`

Request body:

```json
{
  "title": "RX 9070 XT Sapphire",
  "search_terms": ["RX 9070 XT", "Sapphire"],
  "active": true
}
```

Rules:

- `title` is required.
- `search_terms` is required.
- `search_terms` must contain between 1 and 5 non-empty terms.
- Duplicated search terms are removed case-insensitively.
- `scrapes_per_day` is not accepted. Collection cadence is global.

Legacy compatibility:

- `search_term` is still accepted as a legacy single-term alias when `search_terms` is not sent.

Returns `201` with the created tracked product.

Tracked-product responses use the same public fields on reads and writes:

- `title`, not `product_title`
- `search_terms`, not `search_term`
- no `scrapes_per_day`

### `GET /tracked-products/<tracked_product_id>`

Returns one tracked product in the same shape as `POST /tracked-products`.

### `PUT /tracked-products/<tracked_product_id>`

### `PATCH /tracked-products/<tracked_product_id>`

Accepted fields:

```json
{
  "title": "RX 9070 XT Sapphire Nitro",
  "search_terms": ["RX 9070 XT", "Sapphire", "Nitro"],
  "active": true
}
```

Legacy compatibility:

- `search_term` is accepted as a single-term alias.

Returns the updated tracked product.

### `DELETE /tracked-products/<tracked_product_id>`

Returns `204` on success.

### `POST /tracked-products/<tracked_product_id>?action=collect`

Triggers collection for one tracked product across all registered sources.

Returns:

```json
{
  "tracked_product_id": "0d95d62b8f72457d9cd8d5d2c0f7b62f",
  "search_run_ids": [
    "23df7f417d9147ed86c57018de93f6c9",
    "e60a9275e0864ef1b65088df8f652cb8"
  ],
  "successful_runs": 2,
  "failed_runs": 0,
  "total_results": 34,
  "matched_results": 5,
  "page_count": 3
}
```

Notes:

- Each `search_run_id` corresponds to one source-specific run.
- `matched_results` is the total number of persisted matched items across all successful source runs.
- Each source run still saves at most the 4 lowest matching prices.

### `POST /collect-due`

Triggers collection for every active tracked product across all registered sources.

Notes:

- This endpoint is kept for compatibility.
- Because collection cadence is global, it currently behaves the same as collecting all active tracked products.

Returns an array of the same collection-result objects returned by per-product collection.

### `GET /tracked-products/<tracked_product_id>/history`

Query params:

- `limit` defaults to `100` and is capped at `500`.

Returns an array of saved price points:

```json
[
  {
    "captured_at": "2026-03-08T12:00:00+00:00",
    "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
    "canonical_url": "https://www.kabum.com.br/produto/1/rx-9070-xt",
    "price": "5499.99",
    "currency": "BRL",
    "seller_name": "KaBuM!",
    "search_run_id": "23df7f417d9147ed86c57018de93f6c9"
  }
]
```

### `GET /price-history/minimums`

Query params:

- `product_id` required.
- `granularity` preferred and must be `day`, `week`, or `month`.
- `period` accepted as a legacy alias for `granularity`.
- `start_at` required. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.
- `end_at` required. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.

Returns the lowest saved price found in each period inside the requested range:

```json
{
  "product_id": "0d95d62b8f72457d9cd8d5d2c0f7b62f",
  "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
  "granularity": "week",
  "period": "week",
  "start_at": "2026-03-01T00:00:00+00:00",
  "end_at": "2026-03-31T23:59:59.999999+00:00",
  "items": [
    {
      "period_start": "2026-03-02T00:00:00+00:00",
      "captured_at": "2026-03-04T12:00:00+00:00",
      "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
      "source_product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB OC Triple Fan",
      "canonical_url": "https://www.kabum.com.br/produto/1/rx-9070-xt",
      "price": "5499.99",
      "currency": "BRL",
      "seller_name": "KaBuM!",
      "search_run_id": "23df7f417d9147ed86c57018de93f6c9"
    }
  ]
}
```

Notes:

- `items` are ordered ascending by `period_start`.
- `product_title` now reflects the tracked product title stored in the products table.
- `source_product_title` keeps the original scraped listing title for reference.
- `week` buckets start on Monday at `00:00:00+00:00`.
- If `start_at` or `end_at` is sent as a date only, the API expands it to the full UTC day boundary.
- Empty ranges return `"items": []`.
- Browser clients may send an `OPTIONS` preflight first; API routes should answer that preflight and reflect any `Access-Control-Request-Headers` values in `Access-Control-Allow-Headers`.

### `GET /search-runs`

Query params:

- `date=YYYY-MM-DD`
- `limit`, default `40`, max `200`

Returns source-specific search runs plus saved items for each run.
