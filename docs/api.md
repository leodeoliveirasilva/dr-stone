# API Reference

## Overview

Tracked products are source-agnostic.

- Register `1..5` `search_terms` for each tracked product.
- The collector joins those terms into one source query.
- Every tracked product is collected from every registered source adapter in the project.
- A scraped item matches only when its title contains all tracked search terms, case-insensitively.
- Collection cadence is global and is not configured per tracked product.
- `all` is a synthetic API filter value. It is not stored as a real source.

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

### `GET /sources`

Returns the canonical source catalog used by source-aware filters and chart series.

```json
{
  "sources": [
    {
      "source_name": "kabum",
      "source_label": "KaBuM!",
      "active": true
    },
    {
      "source_name": "amazon",
      "source_label": "Amazon",
      "active": false
    }
  ]
}
```

Notes:

- `source_name` is the stable machine identifier used in query params and response metadata.
- `source_label` is the UI-facing label.
- `active=true` means the source is currently enabled in runtime configuration.
- `all` is not returned here because it is only a synthetic frontend filter.

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
- `offset` defaults to `0`.
- `start_at` optional. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.
- `end_at` optional. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.
- `source` optional. Defaults to `all`. Accepts `all` or a valid `source_name`.

Returns a paginated history window:

```json
{
  "product_id": "0d95d62b8f72457d9cd8d5d2c0f7b62f",
  "product_title": "RX 9070 XT",
  "source_filter": "all",
  "limit": 100,
  "offset": 0,
  "has_more": true,
  "next_offset": 100,
  "start_at": "2026-03-01T00:00:00+00:00",
  "end_at": "2026-03-31T23:59:59.999999+00:00",
  "items": [
    {
      "captured_at": "2026-03-08T12:00:00+00:00",
      "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
      "canonical_url": "https://www.kabum.com.br/produto/1/rx-9070-xt",
      "price": "5499.99",
      "currency": "BRL",
      "seller_name": "KaBuM!",
      "search_run_id": "23df7f417d9147ed86c57018de93f6c9",
      "source_name": "kabum",
      "source_label": "KaBuM!"
    }
  ]
}
```

Notes:

- `items` are ordered by `captured_at` descending, then price ascending within the same capture timestamp.
- Source filtering is applied before pagination.
- Omitting `start_at` and `end_at` returns the full saved history.
- If `start_at` or `end_at` is sent as a date only, the API expands it to the full UTC day boundary.
- Unknown `source` values return `400`.

### `GET /price-history/minimums`

Query params:

- `product_id` required.
- `granularity` preferred and must be `day`, `week`, or `month`.
- `period` accepted as a legacy alias for `granularity`.
- `start_at` required. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.
- `end_at` required. Accepts `YYYY-MM-DD` or an ISO 8601 datetime.
- `source` optional. Defaults to `all`. Accepts `all` or a valid `source_name`.

Returns source-aware minimum series inside the requested range:

```json
{
  "product_id": "0d95d62b8f72457d9cd8d5d2c0f7b62f",
  "product_title": "RX 9070 XT Sapphire",
  "granularity": "week",
  "period": "week",
  "start_at": "2026-03-01T00:00:00+00:00",
  "end_at": "2026-03-31T23:59:59.999999+00:00",
  "source_filter": "all",
  "series": [
    {
      "source_name": "kabum",
      "source_label": "KaBuM!",
      "items": [
        {
          "period_start": "2026-03-02T00:00:00+00:00",
          "captured_at": "2026-03-04T12:00:00+00:00",
          "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
          "canonical_url": "https://www.kabum.com.br/produto/1/rx-9070-xt",
          "price": "5499.99",
          "currency": "BRL",
          "seller_name": "KaBuM!",
          "search_run_id": "23df7f417d9147ed86c57018de93f6c9",
          "source_name": "kabum",
          "source_label": "KaBuM!"
        }
      ]
    }
  ],
  "items": [
    {
      "period_start": "2026-03-02T00:00:00+00:00",
      "captured_at": "2026-03-04T12:00:00+00:00",
      "product_title": "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
      "canonical_url": "https://www.kabum.com.br/produto/1/rx-9070-xt",
      "price": "5499.99",
      "currency": "BRL",
      "seller_name": "KaBuM!",
      "search_run_id": "23df7f417d9147ed86c57018de93f6c9",
      "source_name": "kabum",
      "source_label": "KaBuM!"
    }
  ]
}
```

Notes:

- `source=all` means separate per-source series, not one merged cheapest line.
- `series` is the primary response shape for dashboards.
- `items` is kept as a temporary flat legacy field for compatibility.
- `source=kabum` returns one source series. If the source is valid but has no data in range, that series has an empty `items` array.
- When `source=all`, only sources with data in range are returned in `series`.
- Each item `product_title` is the scraped source listing title.
- `week` buckets start on Monday at `00:00:00+00:00`.
- If `start_at` or `end_at` is sent as a date only, the API expands it to the full UTC day boundary.
- Unknown `source` values return `400`.
- Empty ranges return `"items": []` and, for source-specific requests, one empty `series` entry.
- Browser clients may send an `OPTIONS` preflight first; API routes should answer that preflight and reflect any `Access-Control-Request-Headers` values in `Access-Control-Allow-Headers`.

### `GET /search-runs`

Query params:

- `date=YYYY-MM-DD`
- `limit`, default `40`, max `200`

Returns source-specific search runs plus saved items for each run.
