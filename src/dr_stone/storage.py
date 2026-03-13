from __future__ import annotations

import json
import logging
import sqlite3
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from dr_stone.models import (
    PeriodMinimumPriceEntry,
    ScrapeFailure,
    SearchHistoryEntry,
    SearchResultItem,
    TrackedProduct,
)
from dr_stone.repositories import (
    PostgresPriceHistoryRepository,
    SQLitePriceHistoryRepository,
)
from dr_stone.search_terms import build_search_query, normalize_search_terms


class SQLiteStorage:
    def __init__(self, database_path: str | Path, logger: logging.Logger) -> None:
        self.database_path = Path(database_path)
        self.logger = logger
        self.price_history_repository = SQLitePriceHistoryRepository()

    def connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def apply_migrations(self, migrations_dir: str | Path) -> list[str]:
        migrations_path = Path(migrations_dir)
        applied_now: list[str] = []

        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied = {
                row["filename"]
                for row in connection.execute("SELECT filename FROM schema_migrations")
            }

            for migration in sorted(migrations_path.glob("*.sql")):
                if migration.name in applied:
                    continue
                connection.executescript(migration.read_text(encoding="utf-8"))
                connection.execute(
                    "INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)",
                    (migration.name, _utc_now()),
                )
                applied_now.append(migration.name)

        if applied_now:
            self.logger.info(
                "db_migrations_applied",
                extra={"event_data": {"database_path": str(self.database_path), "migrations": applied_now}},
            )
        return applied_now

    def create_tracked_product(
        self,
        *,
        product_title: str,
        search_terms: list[str],
        active: bool = True,
    ) -> TrackedProduct:
        normalized_terms = normalize_search_terms(search_terms)
        search_query = build_search_query(normalized_terms)
        tracked_product_id = _new_id()
        timestamp = _utc_now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO tracked_products (
                    id,
                    source_name,
                    product_title,
                    search_term,
                    search_terms_json,
                    scrapes_per_day,
                    active,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tracked_product_id,
                    "all",
                    product_title,
                    search_query,
                    json.dumps(normalized_terms, ensure_ascii=True),
                    4,
                    int(active),
                    timestamp,
                    timestamp,
                ),
            )
        tracked_product = self.get_tracked_product(tracked_product_id)
        assert tracked_product is not None
        return tracked_product

    def list_tracked_products(
        self,
        *,
        active_only: bool = True,
    ) -> list[TrackedProduct]:
        query = "SELECT * FROM tracked_products WHERE 1 = 1"
        params: list[object] = []
        if active_only:
            query += " AND active = 1"
        query += " ORDER BY created_at ASC"

        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self._row_to_tracked_product(row) for row in rows]

    def list_due_tracked_products(
        self,
        *,
        now: datetime | None = None,
    ) -> list[TrackedProduct]:
        return self.list_tracked_products(active_only=True)

    def get_tracked_product(self, tracked_product_id: str) -> TrackedProduct | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM tracked_products WHERE id = ?",
                (tracked_product_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_tracked_product(row)

    def create_search_run(
        self,
        *,
        tracked_product_id: str,
        source_name: str,
        search_term: str,
        search_url: str,
    ) -> str:
        search_run_id = _new_id()
        timestamp = _utc_now()
        with self.connect() as connection:
            connection.execute(
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
                """,
                (
                    search_run_id,
                    tracked_product_id,
                    source_name,
                    search_term,
                    search_url,
                    "running",
                    timestamp,
                    timestamp,
                ),
            )
        return search_run_id

    def finish_search_run(
        self,
        search_run_id: str,
        *,
        status: str,
        total_results: int | None = None,
        matched_results: int | None = None,
        page_count: int | None = None,
        message: str | None = None,
    ) -> None:
        finished_at = datetime.now(UTC)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT started_at FROM search_runs WHERE id = ?",
                (search_run_id,),
            ).fetchone()
            duration_ms = None
            if row:
                started_at = datetime.fromisoformat(str(row["started_at"]))
                duration_ms = int((finished_at - started_at).total_seconds() * 1000)
            connection.execute(
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
                """,
                (
                    status,
                    finished_at.isoformat(),
                    duration_ms,
                    total_results,
                    matched_results,
                    page_count,
                    message,
                    search_run_id,
                ),
            )

    def persist_search_run_items(
        self,
        *,
        search_run_id: str,
        tracked_product_id: str,
        items: list[SearchResultItem],
        captured_at: datetime,
    ) -> int:
        with self.connect() as connection:
            for item in items:
                connection.execute(
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
                    """,
                    (
                        _new_id(),
                        search_run_id,
                        tracked_product_id,
                        item.source,
                        item.title,
                        item.canonical_url,
                        _coerce_text(item.metadata.get("source_product_key")),
                        _coerce_text(item.metadata.get("seller_name")),
                        str(item.price),
                        item.currency,
                        item.availability,
                        int(item.is_available),
                        item.position,
                        captured_at.isoformat(),
                        json.dumps(item.metadata, ensure_ascii=True, sort_keys=True),
                        _utc_now(),
                    ),
                )
        return len(items)

    def list_price_history(
        self,
        tracked_product_id: str,
        *,
        limit: int = 100,
        offset: int = 0,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> list[SearchHistoryEntry]:
        with self.connect() as connection:
            return self.price_history_repository.list_history(
                connection,
                tracked_product_id,
                limit=limit,
                offset=offset,
                start_at=start_at,
                end_at=end_at,
            )

    def list_period_minimum_prices(
        self,
        tracked_product_id: str,
        *,
        period: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[PeriodMinimumPriceEntry]:
        with self.connect() as connection:
            return self.price_history_repository.list_period_minimums(
                connection,
                tracked_product_id,
                period=period,
                start_at=start_at,
                end_at=end_at,
            )

    def record_failure(
        self,
        failure: ScrapeFailure,
        *,
        search_run_id: str | None = None,
    ) -> str:
        failure_id = _new_id()
        with self.connect() as connection:
            connection.execute(
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
                """,
                (
                    failure_id,
                    search_run_id,
                    failure.source,
                    failure.stage,
                    failure.error_code,
                    failure.error_type,
                    failure.message,
                    int(failure.retriable),
                    failure.http_status,
                    failure.target_url,
                    failure.final_url,
                    json.dumps(failure.details, ensure_ascii=True, sort_keys=True),
                    failure.captured_at.isoformat(),
                ),
            )
        return failure_id

    def _row_to_tracked_product(self, row: Mapping[str, object]) -> TrackedProduct:
        return TrackedProduct(
            id=str(row["id"]),
            product_title=str(row["product_title"]),
            search_terms=_parse_search_terms_row(row),
            active=bool(row["active"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )

    def _row_to_history_entry(self, row: Mapping[str, object]) -> SearchHistoryEntry:
        return SearchHistoryEntry(
            captured_at=datetime.fromisoformat(str(row["captured_at"])),
            product_title=str(row["product_title"]),
            canonical_url=str(row["canonical_url"]),
            price=Decimal(str(row["price_value"])),
            currency=str(row["currency"]),
            seller_name=_coerce_text(row["seller_name"]),
            search_run_id=str(row["search_run_id"]),
        )


class PostgresStorage:
    def __init__(self, database_url: str, logger: logging.Logger) -> None:
        self.database_url = database_url
        self.logger = logger
        self.price_history_repository = PostgresPriceHistoryRepository()

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def apply_migrations(self, migrations_dir: str | Path) -> list[str]:
        migrations_path = Path(migrations_dir)
        applied_now: list[str] = []

        with self.connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied = {
                row["filename"]
                for row in connection.execute("SELECT filename FROM schema_migrations")
            }

            for migration in sorted(migrations_path.glob("*.sql")):
                if migration.name in applied:
                    continue
                connection.execute(migration.read_text(encoding="utf-8"))
                connection.execute(
                    "INSERT INTO schema_migrations (filename, applied_at) VALUES (%s, %s)",
                    (migration.name, _utc_now()),
                )
                applied_now.append(migration.name)

        if applied_now:
            self.logger.info(
                "db_migrations_applied",
                extra={"event_data": {"database_url": self.database_url, "migrations": applied_now}},
            )
        return applied_now

    def create_tracked_product(
        self,
        *,
        product_title: str,
        search_terms: list[str],
        active: bool = True,
    ) -> TrackedProduct:
        normalized_terms = normalize_search_terms(search_terms)
        search_query = build_search_query(normalized_terms)
        tracked_product_id = _new_id()
        timestamp = _utc_now()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO tracked_products (
                    id,
                    source_name,
                    product_title,
                    search_term,
                    search_terms_json,
                    scrapes_per_day,
                    active,
                    created_at,
                    updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    tracked_product_id,
                    "all",
                    product_title,
                    search_query,
                    json.dumps(normalized_terms, ensure_ascii=True),
                    4,
                    int(active),
                    timestamp,
                    timestamp,
                ),
            )
        tracked_product = self.get_tracked_product(tracked_product_id)
        assert tracked_product is not None
        return tracked_product

    def list_tracked_products(
        self,
        *,
        active_only: bool = True,
    ) -> list[TrackedProduct]:
        query = "SELECT * FROM tracked_products WHERE 1 = 1"
        params: list[object] = []
        if active_only:
            query += " AND active = 1"
        query += " ORDER BY created_at ASC"

        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self._row_to_tracked_product(row) for row in rows]

    def list_due_tracked_products(
        self,
        *,
        now: datetime | None = None,
    ) -> list[TrackedProduct]:
        return self.list_tracked_products(active_only=True)

    def get_tracked_product(self, tracked_product_id: str) -> TrackedProduct | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM tracked_products WHERE id = %s",
                (tracked_product_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_tracked_product(row)

    def create_search_run(
        self,
        *,
        tracked_product_id: str,
        source_name: str,
        search_term: str,
        search_url: str,
    ) -> str:
        search_run_id = _new_id()
        timestamp = _utc_now()
        with self.connect() as connection:
            connection.execute(
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
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    search_run_id,
                    tracked_product_id,
                    source_name,
                    search_term,
                    search_url,
                    "running",
                    timestamp,
                    timestamp,
                ),
            )
        return search_run_id

    def finish_search_run(
        self,
        search_run_id: str,
        *,
        status: str,
        total_results: int | None = None,
        matched_results: int | None = None,
        page_count: int | None = None,
        message: str | None = None,
    ) -> None:
        finished_at = datetime.now(UTC)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT started_at FROM search_runs WHERE id = %s",
                (search_run_id,),
            ).fetchone()
            duration_ms = None
            if row:
                started_at = datetime.fromisoformat(str(row["started_at"]))
                duration_ms = int((finished_at - started_at).total_seconds() * 1000)
            connection.execute(
                """
                UPDATE search_runs
                SET status = %s,
                    finished_at = %s,
                    duration_ms = %s,
                    total_results = %s,
                    matched_results = %s,
                    page_count = %s,
                    message = %s
                WHERE id = %s
                """,
                (
                    status,
                    finished_at.isoformat(),
                    duration_ms,
                    total_results,
                    matched_results,
                    page_count,
                    message,
                    search_run_id,
                ),
            )

    def persist_search_run_items(
        self,
        *,
        search_run_id: str,
        tracked_product_id: str,
        items: list[SearchResultItem],
        captured_at: datetime,
    ) -> int:
        with self.connect() as connection:
            for item in items:
                connection.execute(
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
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        _new_id(),
                        search_run_id,
                        tracked_product_id,
                        item.source,
                        item.title,
                        item.canonical_url,
                        _coerce_text(item.metadata.get("source_product_key")),
                        _coerce_text(item.metadata.get("seller_name")),
                        str(item.price),
                        item.currency,
                        item.availability,
                        int(item.is_available),
                        item.position,
                        captured_at.isoformat(),
                        json.dumps(item.metadata, ensure_ascii=True, sort_keys=True),
                        _utc_now(),
                    ),
                )
        return len(items)

    def list_price_history(
        self,
        tracked_product_id: str,
        *,
        limit: int = 100,
        offset: int = 0,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> list[SearchHistoryEntry]:
        with self.connect() as connection:
            return self.price_history_repository.list_history(
                connection,
                tracked_product_id,
                limit=limit,
                offset=offset,
                start_at=start_at,
                end_at=end_at,
            )

    def list_period_minimum_prices(
        self,
        tracked_product_id: str,
        *,
        period: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[PeriodMinimumPriceEntry]:
        with self.connect() as connection:
            return self.price_history_repository.list_period_minimums(
                connection,
                tracked_product_id,
                period=period,
                start_at=start_at,
                end_at=end_at,
            )

    def update_tracked_product(
        self,
        tracked_product_id: str,
        *,
        product_title: str,
        search_terms: list[str],
        active: bool,
    ) -> TrackedProduct | None:
        normalized_terms = normalize_search_terms(search_terms)
        search_query = build_search_query(normalized_terms)
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE tracked_products
                SET source_name = %s,
                    product_title = %s,
                    search_term = %s,
                    search_terms_json = %s,
                    scrapes_per_day = %s,
                    active = %s,
                    updated_at = %s
                WHERE id = %s
                """,
                (
                    "all",
                    product_title,
                    search_query,
                    json.dumps(normalized_terms, ensure_ascii=True),
                    4,
                    int(active),
                    _utc_now(),
                    tracked_product_id,
                ),
            )
        return self.get_tracked_product(tracked_product_id)

    def delete_tracked_product(self, tracked_product_id: str) -> bool:
        with self.connect() as connection:
            row = connection.execute(
                "DELETE FROM tracked_products WHERE id = %s RETURNING id",
                (tracked_product_id,),
            ).fetchone()
        return row is not None

    def list_search_runs(
        self,
        *,
        date: str | None = None,
        limit: int = 40,
    ) -> list[dict[str, object]]:
        if date:
            query = """
                SELECT
                    search_runs.*,
                    tracked_products.product_title AS tracked_product_title,
                    tracked_products.active AS tracked_product_active
                FROM search_runs
                LEFT JOIN tracked_products ON tracked_products.id = search_runs.tracked_product_id
                WHERE CAST(search_runs.started_at AS DATE) = %s
                ORDER BY search_runs.started_at DESC
                LIMIT %s
            """
            params: tuple[object, ...] = (date, limit)
        else:
            query = """
                SELECT
                    search_runs.*,
                    tracked_products.product_title AS tracked_product_title,
                    tracked_products.active AS tracked_product_active
                FROM search_runs
                LEFT JOIN tracked_products ON tracked_products.id = search_runs.tracked_product_id
                ORDER BY search_runs.started_at DESC
                LIMIT %s
            """
            params = (limit,)

        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
            if not rows:
                return []

            run_ids = [str(row["id"]) for row in rows]
            item_rows = connection.execute(
                """
                SELECT
                    search_run_id,
                    product_title,
                    canonical_url,
                    price_value,
                    currency,
                    seller_name,
                    availability,
                    is_available,
                    position,
                    captured_at
                FROM search_run_items
                WHERE search_run_id = ANY(%s)
                ORDER BY captured_at DESC, CAST(price_value AS NUMERIC) ASC, position ASC
                """,
                (run_ids,),
            ).fetchall()

        grouped_items: dict[str, list[dict[str, object]]] = {}
        for item in item_rows:
            normalized_item = dict(item)
            normalized_item["is_available"] = bool(normalized_item["is_available"])
            grouped_items.setdefault(str(item["search_run_id"]), []).append(normalized_item)

        normalized_rows: list[dict[str, object]] = []
        for row in rows:
            payload = dict(row)
            payload["tracked_product_active"] = bool(payload["tracked_product_active"]) if payload["tracked_product_active"] is not None else None
            payload["items"] = grouped_items.get(str(row["id"]), [])
            normalized_rows.append(payload)
        return normalized_rows

    def record_failure(
        self,
        failure: ScrapeFailure,
        *,
        search_run_id: str | None = None,
    ) -> str:
        failure_id = _new_id()
        with self.connect() as connection:
            connection.execute(
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
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    failure_id,
                    search_run_id,
                    failure.source,
                    failure.stage,
                    failure.error_code,
                    failure.error_type,
                    failure.message,
                    int(failure.retriable),
                    failure.http_status,
                    failure.target_url,
                    failure.final_url,
                    json.dumps(failure.details, ensure_ascii=True, sort_keys=True),
                    failure.captured_at.isoformat(),
                ),
            )
        return failure_id

    def _row_to_tracked_product(self, row: Mapping[str, object]) -> TrackedProduct:
        return TrackedProduct(
            id=str(row["id"]),
            product_title=str(row["product_title"]),
            search_terms=_parse_search_terms_row(row),
            active=bool(row["active"]),
            created_at=datetime.fromisoformat(str(row["created_at"])),
            updated_at=datetime.fromisoformat(str(row["updated_at"])),
        )

    def _row_to_history_entry(self, row: Mapping[str, object]) -> SearchHistoryEntry:
        return SearchHistoryEntry(
            captured_at=datetime.fromisoformat(str(row["captured_at"])),
            product_title=str(row["product_title"]),
            canonical_url=str(row["canonical_url"]),
            price=Decimal(str(row["price_value"])),
            currency=str(row["currency"]),
            seller_name=_coerce_text(row["seller_name"]),
            search_run_id=str(row["search_run_id"]),
        )


def _new_id() -> str:
    return uuid4().hex


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _coerce_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _parse_search_terms_row(row: Mapping[str, object]) -> list[str]:
    search_terms_json = _mapping_get(row, "search_terms_json")
    if search_terms_json:
        payload = json.loads(str(search_terms_json))
        if isinstance(payload, list):
            return normalize_search_terms(payload)
    legacy_search_term = _mapping_get(row, "search_term")
    return normalize_search_terms([legacy_search_term])


def _mapping_get(row: Mapping[str, object], key: str) -> object | None:
    try:
        return row[key]
    except (KeyError, IndexError):
        return None
