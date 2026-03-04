from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from dr_stone.models import ScrapeFailure, SearchResultItem
from dr_stone.storage import SQLiteStorage


def test_apply_migrations_creates_expected_tables(tmp_path: Path) -> None:
    database_path = tmp_path / "dr_stone.sqlite3"
    storage = SQLiteStorage(database_path, logging.getLogger("test"))

    applied = storage.apply_migrations(Path(__file__).resolve().parents[1] / "migrations")

    assert applied == ["0001_initial_schema.sql"]

    with storage.connect() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }

    assert {
        "schema_migrations",
        "tracked_products",
        "search_runs",
        "search_run_items",
        "scrape_failures",
    }.issubset(tables)


def test_record_failure_persists_structured_context(tmp_path: Path) -> None:
    database_path = tmp_path / "dr_stone.sqlite3"
    storage = SQLiteStorage(database_path, logging.getLogger("test"))
    storage.apply_migrations(Path(__file__).resolve().parents[1] / "migrations")

    failure = ScrapeFailure(
        source="kabum",
        stage="fetch",
        error_code="timeout",
        error_type="FetchError",
        message="Request timed out",
        target_url="https://www.kabum.com.br/busca/rx-9070-xt",
        retriable=True,
        http_status=504,
        details={"attempt": 2},
    )

    failure_id = storage.record_failure(failure)

    with storage.connect() as connection:
        row = connection.execute(
            "SELECT * FROM scrape_failures WHERE id = ?",
            (failure_id,),
        ).fetchone()

    assert row["error_code"] == "timeout"
    assert row["retriable"] == 1
    assert json.loads(row["details_json"]) == {"attempt": 2}


def test_search_tracking_persists_runs_items_and_history(tmp_path: Path) -> None:
    database_path = tmp_path / "dr_stone.sqlite3"
    storage = SQLiteStorage(database_path, logging.getLogger("test"))
    storage.apply_migrations(Path(__file__).resolve().parents[1] / "migrations")

    tracked_product = storage.create_tracked_product(
        product_title="RX 9070 XT",
        search_term="RX 9070 XT",
    )
    search_run_id = storage.create_search_run(
        tracked_product,
        "https://www.kabum.com.br/busca/rx-9070-xt",
    )
    inserted = storage.persist_search_run_items(
        search_run_id=search_run_id,
        tracked_product_id=tracked_product.id,
        items=[
            SearchResultItem(
                source="kabum",
                title="Placa RX 9070 XT",
                canonical_url="https://www.kabum.com.br/produto/1/rx-9070-xt",
                price=Decimal("5999.99"),
                currency="BRL",
                availability="in_stock",
                is_available=True,
                position=1,
                metadata={"source_product_key": "1", "seller_name": "KaBuM!"},
            )
        ],
        captured_at=datetime(2026, 3, 4, tzinfo=UTC),
    )
    storage.finish_search_run(
        search_run_id,
        status="succeeded",
        total_results=20,
        matched_results=inserted,
        page_count=1,
        message="lowest_prices_saved",
    )

    with storage.connect() as connection:
        run_row = connection.execute(
            "SELECT status, total_results, matched_results, page_count FROM search_runs WHERE id = ?",
            (search_run_id,),
        ).fetchone()
        item_row = connection.execute(
            "SELECT source_product_key, seller_name, price_value FROM search_run_items WHERE search_run_id = ?",
            (search_run_id,),
        ).fetchone()

    history = storage.list_price_history(tracked_product.id)

    assert dict(run_row) == {
        "status": "succeeded",
        "total_results": 20,
        "matched_results": 1,
        "page_count": 1,
    }
    assert dict(item_row) == {
        "source_product_key": "1",
        "seller_name": "KaBuM!",
        "price_value": "5999.99",
    }
    assert len(history) == 1
    assert history[0].price == Decimal("5999.99")


def test_list_due_tracked_products_uses_scrapes_per_day_interval(tmp_path: Path) -> None:
    database_path = tmp_path / "dr_stone.sqlite3"
    storage = SQLiteStorage(database_path, logging.getLogger("test"))
    storage.apply_migrations(Path(__file__).resolve().parents[1] / "migrations")

    now = datetime(2026, 3, 4, 12, 0, tzinfo=UTC)
    due_product = storage.create_tracked_product(
        product_title="RX 9070 XT",
        search_term="RX 9070 XT",
        scrapes_per_day=4,
    )
    recent_product = storage.create_tracked_product(
        product_title="RX 9060 XT",
        search_term="RX 9060 XT",
        scrapes_per_day=4,
    )

    run_id = storage.create_search_run(recent_product, "https://www.kabum.com.br/busca/rx-9060-xt")
    with storage.connect() as connection:
        connection.execute(
            "UPDATE search_runs SET status = ?, finished_at = ? WHERE id = ?",
            ("succeeded", (now - timedelta(hours=2)).isoformat(), run_id),
        )

    due = storage.list_due_tracked_products(now=now)

    assert [product.id for product in due] == [due_product.id]
