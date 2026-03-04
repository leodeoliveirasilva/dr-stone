from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import quote, urlparse

from workers import Response, WorkerEntrypoint

from dr_stone.matching import title_contains_expected
from dr_stone.normalizers import normalize_availability, normalize_currency, normalize_price


UTC = timezone.utc
KABUM_BASE_URL = "https://www.kabum.com.br"
DEFAULT_SCRAPES_PER_DAY = 4
MAX_RESULTS_PER_RUN = 4


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        method = str(request.method).upper()
        url = urlparse(str(request.url))
        path = url.path.rstrip("/") or "/"
        query = _parse_query_string(url.query)

        if path == "/health" and method == "GET":
            return _json_response({"status": "ok"})

        if path == "/tracked-products":
            if method == "GET":
                rows = await _fetch_all_tracked_products(self.env, include_inactive=query.get("all") == "1")
                return _json_response(rows)
            if method == "POST":
                payload = await request.json()
                created = await _create_tracked_product(self.env, payload)
                return _json_response(created, status=201)

        if path == "/collect-due" and method == "POST":
            results = await _collect_due(self.env)
            return _json_response(results)

        if path.startswith("/tracked-products/"):
            parts = [part for part in path.split("/") if part]
            if len(parts) == 2 and method == "POST" and query.get("action") == "collect":
                result = await _collect_one(self.env, parts[1])
                return _json_response(result)
            if len(parts) == 3 and parts[2] == "history" and method == "GET":
                limit = int(query.get("limit", "100"))
                history = await _history(self.env, parts[1], limit)
                return _json_response(history)

        return _json_response({"error": "Not found"}, status=404)

    async def scheduled(self, controller, env, ctx):
        await _collect_due(env)


async def _create_tracked_product(env, payload: Any) -> dict[str, Any]:
    product_title = _require_string(payload, "title")
    search_term = _require_string(payload, "search_term")
    source = _coerce_string(payload.get("source")) or "kabum"
    scrapes_per_day = int(payload.get("scrapes_per_day") or DEFAULT_SCRAPES_PER_DAY)
    active = 1 if payload.get("active", True) else 0
    tracked_product_id = _new_id()
    timestamp = _utc_now()

    await env.DB.prepare(
        """
        INSERT INTO tracked_products (
            id,
            source_name,
            product_title,
            search_term,
            scrapes_per_day,
            active,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
    ).bind(
        tracked_product_id,
        source,
        product_title,
        search_term,
        scrapes_per_day,
        active,
        timestamp,
        timestamp,
    ).run()

    created = await env.DB.prepare(
        """
        SELECT *
        FROM tracked_products
        WHERE id = ?
        """
    ).bind(tracked_product_id).first()

    return _js_to_py(created)


async def _fetch_all_tracked_products(env, *, include_inactive: bool = False) -> list[dict[str, Any]]:
    if include_inactive:
        result = await env.DB.prepare(
            """
            SELECT *
            FROM tracked_products
            ORDER BY created_at ASC
            """
        ).run()
    else:
        result = await env.DB.prepare(
            """
            SELECT *
            FROM tracked_products
            WHERE active = 1
            ORDER BY created_at ASC
            """
        ).run()
    return _rows(result)


async def _history(env, tracked_product_id: str, limit: int) -> list[dict[str, Any]]:
    result = await env.DB.prepare(
        """
        SELECT
            captured_at,
            product_title,
            canonical_url,
            price_value,
            currency,
            seller_name,
            search_run_id
        FROM search_run_items
        WHERE tracked_product_id = ?
        ORDER BY captured_at DESC, CAST(price_value AS REAL) ASC
        LIMIT ?
        """
    ).bind(tracked_product_id, limit).run()
    return _rows(result)


async def _collect_due(env) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    tracked_products = await _fetch_all_tracked_products(env, include_inactive=False)
    due: list[dict[str, Any]] = []

    for tracked_product in tracked_products:
        latest = await env.DB.prepare(
            """
            SELECT status, started_at, finished_at
            FROM search_runs
            WHERE tracked_product_id = ?
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).bind(tracked_product["id"]).first()
        latest_row = _js_to_py(latest)
        if latest_row is None:
            due.append(tracked_product)
            continue
        if latest_row["status"] == "running":
            continue
        reference = latest_row["finished_at"] or latest_row["started_at"]
        reference_time = datetime.fromisoformat(reference)
        interval_seconds = 86400 / max(1, int(tracked_product["scrapes_per_day"]))
        if now >= reference_time + timedelta(seconds=interval_seconds):
            due.append(tracked_product)

    results: list[dict[str, Any]] = []
    for tracked_product in due:
        results.append(await _collect_tracked_product(env, tracked_product))
    return results


async def _collect_one(env, tracked_product_id: str) -> dict[str, Any]:
    tracked_product = await env.DB.prepare(
        """
        SELECT *
        FROM tracked_products
        WHERE id = ? AND active = 1
        """
    ).bind(tracked_product_id).first()
    tracked_product_row = _js_to_py(tracked_product)
    if tracked_product_row is None:
        raise ValueError(f"Tracked product not found: {tracked_product_id}")
    return await _collect_tracked_product(env, tracked_product_row)


async def _collect_tracked_product(env, tracked_product: dict[str, Any]) -> dict[str, Any]:
    search_url = _build_kabum_search_url(str(tracked_product["search_term"]))
    search_run_id = _new_id()
    started_at = _utc_now()

    await env.DB.prepare(
        """
        INSERT INTO search_runs (
            id,
            tracked_product_id,
            source_name,
            search_term,
            search_url,
            status,
            started_at,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
    ).bind(
        search_run_id,
        tracked_product["id"],
        tracked_product["source_name"],
        tracked_product["search_term"],
        search_url,
        "running",
        started_at,
        started_at,
    ).run()

    try:
        run = await _scrape_kabum_search(str(tracked_product["search_term"]))
        matched_items = [
            item
            for item in run["items"]
            if title_contains_expected(str(tracked_product["product_title"]), str(item["title"]))
        ]
        matched_items.sort(key=lambda item: (Decimal(str(item["price"])), item["position"], item["title"]))
        selected_items = matched_items[:MAX_RESULTS_PER_RUN]

        for item in selected_items:
            await env.DB.prepare(
                """
                INSERT INTO search_run_items (
                    id,
                    search_run_id,
                    tracked_product_id,
                    source_name,
                    product_title,
                    canonical_url,
                    source_product_key,
                    seller_name,
                    price_value,
                    currency,
                    availability,
                    is_available,
                    position,
                    captured_at,
                    metadata_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            ).bind(
                _new_id(),
                search_run_id,
                tracked_product["id"],
                item["source"],
                item["title"],
                item["canonical_url"],
                item.get("source_product_key"),
                item.get("seller_name"),
                item["price"],
                item["currency"],
                item["availability"],
                1 if item["is_available"] else 0,
                item["position"],
                run["fetched_at"],
                json.dumps(item["metadata"], ensure_ascii=True, sort_keys=True),
                _utc_now(),
            ).run()

        await _finish_search_run(
            env,
            search_run_id,
            status="succeeded",
            total_results=int(run["total_results"]),
            matched_results=len(selected_items),
            page_count=int(run["page_count"]),
            message="lowest_prices_saved",
        )
        return {
            "tracked_product_id": tracked_product["id"],
            "search_run_id": search_run_id,
            "total_results": int(run["total_results"]),
            "matched_results": len(selected_items),
            "page_count": int(run["page_count"]),
        }
    except Exception as exc:
        await env.DB.prepare(
            """
            INSERT INTO scrape_failures (
                id,
                search_run_id,
                source_name,
                stage,
                error_code,
                error_type,
                message,
                retriable,
                http_status,
                target_url,
                final_url,
                details_json,
                captured_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        ).bind(
            _new_id(),
            search_run_id,
            tracked_product["source_name"],
            "search_collect",
            "search_collect_failed",
            type(exc).__name__,
            str(exc),
            0,
            None,
            search_url,
            None,
            json.dumps({}, ensure_ascii=True),
            _utc_now(),
        ).run()
        await _finish_search_run(
            env,
            search_run_id,
            status="failed",
            message=str(exc),
        )
        raise


async def _finish_search_run(
    env,
    search_run_id: str,
    *,
    status: str,
    total_results: int | None = None,
    matched_results: int | None = None,
    page_count: int | None = None,
    message: str | None = None,
) -> None:
    finished_at = datetime.now(UTC).isoformat()
    started_at = await env.DB.prepare(
        "SELECT started_at FROM search_runs WHERE id = ?"
    ).bind(search_run_id).first("started_at")
    duration_ms = None
    if started_at:
        duration_ms = int(
            (
                datetime.fromisoformat(finished_at)
                - datetime.fromisoformat(str(started_at))
            ).total_seconds()
            * 1000
        )
    await env.DB.prepare(
        """
        UPDATE search_runs
        SET status = ?,
            finished_at = ?,
            duration_ms = ?,
            total_results = ?,
            matched_results = ?,
            page_count = ?,
            message = ?
        WHERE id = ?
        """
    ).bind(
        status,
        finished_at,
        duration_ms,
        total_results,
        matched_results,
        page_count,
        message,
        search_run_id,
    ).run()


async def _scrape_kabum_search(search_term: str) -> dict[str, Any]:
    first_url = _build_kabum_search_url(search_term)
    first_page = await _scrape_kabum_search_page(first_url)
    items = list(first_page["items"])

    for page_number in range(2, int(first_page["page_count"]) + 1):
        page_url = f"{first_page['resolved_url']}?page_number={page_number}"
        page = await _scrape_kabum_search_page(page_url)
        items.extend(page["items"])

    return {
        "search_term": search_term,
        "resolved_url": first_page["resolved_url"],
        "total_results": first_page["total_results"],
        "page_count": first_page["page_count"],
        "items": items,
        "fetched_at": _utc_now(),
    }


async def _scrape_kabum_search_page(url: str) -> dict[str, Any]:
    response = await fetch(url)
    if response.status != 200:
        raise ValueError(f"KaBuM search request failed with status {response.status}")
    html = await response.text()
    next_data_match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        re.DOTALL,
    )
    if not next_data_match:
        raise ValueError("KaBuM search page is missing __NEXT_DATA__")

    next_data = json.loads(next_data_match.group(1))
    raw_data = next_data.get("props", {}).get("pageProps", {}).get("data")
    if not raw_data:
        raise ValueError("KaBuM search page is missing listing payload")
    page_data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
    catalog = page_data.get("catalogServer", {})
    meta = catalog.get("meta", {})
    rows = catalog.get("data", [])

    canonical_match = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    resolved_url = canonical_match.group(1) if canonical_match else url
    total_results = int(meta.get("totalItemsCount", len(rows)))
    page_count = int(meta.get("totalPagesCount", 1))

    items: list[dict[str, Any]] = []
    for position, row in enumerate(rows, start=1):
        title = row.get("name")
        if not title:
            continue
        price_value = row.get("priceWithDiscount") or row.get("price")
        if price_value is None:
            continue

        availability, is_available = normalize_availability(str(row.get("available")))
        code = row.get("code")
        friendly_name = row.get("friendlyName")
        canonical_url = (
            f"{KABUM_BASE_URL}/produto/{code}/{friendly_name}"
            if code and friendly_name
            else f"{KABUM_BASE_URL}/produto/{code}"
        )
        items.append(
            {
                "source": "kabum",
                "title": title,
                "canonical_url": canonical_url,
                "price": str(normalize_price(price_value)),
                "currency": normalize_currency("BRL"),
                "availability": availability,
                "is_available": is_available,
                "position": position,
                "source_product_key": str(code) if code else None,
                "seller_name": row.get("sellerName"),
                "metadata": {
                    "source_product_key": str(code) if code else None,
                    "seller_name": row.get("sellerName"),
                    "manufacturer": (row.get("manufacturer") or {}).get("name")
                    if isinstance(row.get("manufacturer"), dict)
                    else None,
                },
            }
        )

    return {
        "resolved_url": resolved_url,
        "total_results": total_results,
        "page_count": page_count,
        "items": items,
    }


def _build_kabum_search_url(search_term: str) -> str:
    slug = re.sub(r"[^0-9a-z]+", "-", search_term.casefold()).strip("-")
    return f"{KABUM_BASE_URL}/busca/{quote(slug)}"


def _json_response(payload: Any, *, status: int = 200) -> Response:
    return Response(json.dumps(payload, ensure_ascii=False), headers={"content-type": "application/json"}, status=status)


def _parse_query_string(query: str) -> dict[str, str]:
    pairs = [part for part in query.split("&") if part]
    result: dict[str, str] = {}
    for pair in pairs:
        if "=" in pair:
            key, value = pair.split("=", 1)
        else:
            key, value = pair, ""
        result[key] = value
    return result


def _rows(result: Any) -> list[dict[str, Any]]:
    return _js_to_py(getattr(result, "results", [])) or []


def _js_to_py(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "to_py"):
        return value.to_py()
    try:
        from js import JSON

        return json.loads(JSON.stringify(value))
    except Exception:
        return value


def _require_string(payload: Any, field: str) -> str:
    value = _coerce_string(payload.get(field) if isinstance(payload, dict) else None)
    if not value:
        raise ValueError(f"Missing required field: {field}")
    return value


def _coerce_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _new_id() -> str:
    try:
        from js import crypto

        return str(crypto.randomUUID()).replace("-", "")
    except Exception:
        import uuid

        return uuid.uuid4().hex


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
