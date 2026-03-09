from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal

import psycopg

from dr_stone.models import PeriodMinimumPriceEntry, SearchHistoryEntry


class SQLitePriceHistoryRepository:
    def list_history(
        self,
        connection: sqlite3.Connection,
        tracked_product_id: str,
        *,
        limit: int = 100,
    ) -> list[SearchHistoryEntry]:
        rows = connection.execute(
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
            """,
            (tracked_product_id, limit),
        ).fetchall()
        return [_row_to_history_entry(row) for row in rows]

    def list_period_minimums(
        self,
        connection: sqlite3.Connection,
        tracked_product_id: str,
        *,
        period: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[PeriodMinimumPriceEntry]:
        period_expression = _sqlite_period_expression(period)
        rows = connection.execute(
            f"""
            WITH candidate_items AS (
                SELECT
                    {period_expression} AS period_start,
                    captured_at,
                    product_title,
                    canonical_url,
                    price_value,
                    currency,
                    seller_name,
                    search_run_id
                FROM search_run_items
                WHERE tracked_product_id = ?
                  AND captured_at >= ?
                  AND captured_at <= ?
            ),
            ranked_items AS (
                SELECT
                    period_start,
                    captured_at,
                    product_title,
                    canonical_url,
                    price_value,
                    currency,
                    seller_name,
                    search_run_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY period_start
                        ORDER BY CAST(price_value AS REAL) ASC, captured_at ASC, canonical_url ASC
                    ) AS row_number
                FROM candidate_items
            )
            SELECT
                period_start,
                captured_at,
                product_title,
                canonical_url,
                price_value,
                currency,
                seller_name,
                search_run_id
            FROM ranked_items
            WHERE row_number = 1
            ORDER BY period_start ASC
            """,
            (tracked_product_id, start_at.isoformat(), end_at.isoformat()),
        ).fetchall()
        return [_row_to_period_minimum_entry(row) for row in rows]


class PostgresPriceHistoryRepository:
    def list_history(
        self,
        connection: psycopg.Connection,
        tracked_product_id: str,
        *,
        limit: int = 100,
    ) -> list[SearchHistoryEntry]:
        rows = connection.execute(
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
            WHERE tracked_product_id = %s
            ORDER BY captured_at DESC, CAST(price_value AS NUMERIC) ASC
            LIMIT %s
            """,
            (tracked_product_id, limit),
        ).fetchall()
        return [_row_to_history_entry(row) for row in rows]

    def list_period_minimums(
        self,
        connection: psycopg.Connection,
        tracked_product_id: str,
        *,
        period: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[PeriodMinimumPriceEntry]:
        period_expression = _postgres_period_expression(period)
        rows = connection.execute(
            f"""
            WITH candidate_items AS (
                SELECT
                    {period_expression} AS period_start,
                    captured_at,
                    product_title,
                    canonical_url,
                    price_value,
                    currency,
                    seller_name,
                    search_run_id
                FROM search_run_items
                WHERE tracked_product_id = %s
                  AND captured_at >= %s
                  AND captured_at <= %s
            ),
            ranked_items AS (
                SELECT
                    period_start,
                    captured_at,
                    product_title,
                    canonical_url,
                    price_value,
                    currency,
                    seller_name,
                    search_run_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY period_start
                        ORDER BY CAST(price_value AS NUMERIC) ASC, captured_at ASC, canonical_url ASC
                    ) AS row_number
                FROM candidate_items
            )
            SELECT
                period_start,
                captured_at,
                product_title,
                canonical_url,
                price_value,
                currency,
                seller_name,
                search_run_id
            FROM ranked_items
            WHERE row_number = 1
            ORDER BY period_start ASC
            """,
            (tracked_product_id, start_at.isoformat(), end_at.isoformat()),
        ).fetchall()
        return [_row_to_period_minimum_entry(row) for row in rows]


def _sqlite_period_expression(period: str) -> str:
    expressions = {
        "day": "strftime('%Y-%m-%dT00:00:00+00:00', captured_at)",
        "week": (
            "strftime('%Y-%m-%dT00:00:00+00:00', "
            "date(captured_at, '-' || ((CAST(strftime('%w', captured_at) AS INTEGER) + 6) % 7) || ' days'))"
        ),
        "month": "strftime('%Y-%m-01T00:00:00+00:00', captured_at)",
    }
    return expressions[period]


def _postgres_period_expression(period: str) -> str:
    expressions = {
        "day": "date_trunc('day', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
        "week": "date_trunc('week', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
        "month": "date_trunc('month', captured_at::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'",
    }
    return expressions[period]


def _row_to_history_entry(row: Mapping[str, object]) -> SearchHistoryEntry:
    return SearchHistoryEntry(
        captured_at=_parse_datetime_value(row["captured_at"]),
        product_title=str(row["product_title"]),
        canonical_url=str(row["canonical_url"]),
        price=Decimal(str(row["price_value"])),
        currency=str(row["currency"]),
        seller_name=_coerce_text(row["seller_name"]),
        search_run_id=str(row["search_run_id"]),
    )


def _row_to_period_minimum_entry(row: Mapping[str, object]) -> PeriodMinimumPriceEntry:
    return PeriodMinimumPriceEntry(
        period_start=_parse_datetime_value(row["period_start"]),
        captured_at=_parse_datetime_value(row["captured_at"]),
        product_title=str(row["product_title"]),
        canonical_url=str(row["canonical_url"]),
        price=Decimal(str(row["price_value"])),
        currency=str(row["currency"]),
        seller_name=_coerce_text(row["seller_name"]),
        search_run_id=str(row["search_run_id"]),
    )


def _parse_datetime_value(value: object) -> datetime:
    if isinstance(value, datetime):
        return value
    normalized_value = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(normalized_value)


def _coerce_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
