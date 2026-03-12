from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal

from dr_stone.api import create_app
from dr_stone.models import SearchResultItem
from dr_stone.storage import PostgresStorage


def test_root_and_health_endpoints(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    root_response = client.get("/")
    health_response = client.get("/health")

    assert root_response.status_code == 200
    assert root_response.get_json() == {"name": "dr-stone-api", "status": "ok"}
    assert health_response.status_code == 200
    assert health_response.get_json() == {"status": "ok"}


def test_tracked_product_crud(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    create_response = client.post(
        "/tracked-products",
        json={"title": "RX 9070 XT", "search_terms": ["RX 9070 XT", "Sapphire"]},
    )

    assert create_response.status_code == 201
    tracked_product = create_response.get_json()
    tracked_product_id = tracked_product["id"]
    assert tracked_product["title"] == "RX 9070 XT"
    assert tracked_product["search_terms"] == ["RX 9070 XT", "Sapphire"]
    assert "product_title" not in tracked_product
    assert "search_term" not in tracked_product
    assert "scrapes_per_day" not in tracked_product

    list_response = client.get("/tracked-products")
    history_response = client.get(f"/tracked-products/{tracked_product_id}")
    delete_response = client.delete(f"/tracked-products/{tracked_product_id}")
    missing_response = client.get(f"/tracked-products/{tracked_product_id}")

    assert list_response.status_code == 200
    assert len(list_response.get_json()) == 1
    assert list_response.get_json()[0]["title"] == "RX 9070 XT"
    assert "product_title" not in list_response.get_json()[0]
    assert history_response.status_code == 200
    assert history_response.get_json()["title"] == "RX 9070 XT"
    assert history_response.get_json()["search_terms"] == ["RX 9070 XT", "Sapphire"]
    assert "product_title" not in history_response.get_json()
    assert "search_term" not in history_response.get_json()
    assert "scrapes_per_day" not in history_response.get_json()
    assert delete_response.status_code == 204
    assert missing_response.status_code == 404


def test_tracked_product_rejects_more_than_five_search_terms(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/tracked-products",
        json={
            "title": "RX 9070 XT",
            "search_terms": ["one", "two", "three", "four", "five", "six"],
        },
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "search_terms must contain at most 5 terms."
    }


def test_tracked_product_rejects_per_product_scrape_rate(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    response = client.post(
        "/tracked-products",
        json={
            "title": "RX 9070 XT",
            "search_terms": ["RX 9070 XT"],
            "scrapes_per_day": 8,
        },
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "scrapes_per_day is not supported per product. Collection cadence is global."
    }


def test_price_history_minimums_endpoint_groups_by_period(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    create_response = client.post(
        "/tracked-products",
        json={"title": "RX 9070 XT", "search_terms": ["RX 9070 XT"]},
    )
    product_id = create_response.get_json()["id"]

    storage = PostgresStorage(postgres_database_url, logging.getLogger("test"))

    def persist_item(captured_at: datetime, price: str, product_key: str) -> None:
        search_run_id = storage.create_search_run(
            tracked_product_id=product_id,
            source_name="kabum",
            search_term="RX 9070 XT",
            search_url="https://www.kabum.com.br/busca/rx-9070-xt",
        )
        inserted = storage.persist_search_run_items(
            search_run_id=search_run_id,
            tracked_product_id=product_id,
            items=[
                SearchResultItem(
                    source="kabum",
                    title=f"Placa RX 9070 XT {product_key}",
                    canonical_url=f"https://www.kabum.com.br/produto/{product_key}/rx-9070-xt",
                    price=Decimal(price),
                    currency="BRL",
                    availability="in_stock",
                    is_available=True,
                    position=1,
                    metadata={"source_product_key": product_key, "seller_name": "KaBuM!"},
                )
            ],
            captured_at=captured_at,
        )
        storage.finish_search_run(
            search_run_id,
            status="succeeded",
            total_results=10,
            matched_results=inserted,
            page_count=1,
            message="lowest_prices_saved",
        )

    persist_item(datetime(2026, 3, 2, 8, 0, tzinfo=UTC), "6100.00", "1")
    persist_item(datetime(2026, 3, 2, 15, 0, tzinfo=UTC), "5900.00", "2")
    persist_item(datetime(2026, 3, 4, 12, 0, tzinfo=UTC), "5800.00", "3")
    persist_item(datetime(2026, 3, 10, 9, 30, tzinfo=UTC), "5700.00", "4")
    persist_item(datetime(2026, 4, 2, 9, 30, tzinfo=UTC), "5600.00", "5")

    day_response = client.get(
        "/price-history/minimums",
        query_string={
            "product_id": product_id,
            "period": "day",
            "start_at": "2026-03-01",
            "end_at": "2026-03-31",
        },
    )
    week_response = client.get(
        "/price-history/minimums",
        query_string={
            "product_id": product_id,
            "period": "week",
            "start_at": "2026-03-01T00:00:00Z",
            "end_at": "2026-03-31T23:59:59Z",
        },
    )
    month_response = client.get(
        "/price-history/minimums",
        query_string={
            "product_id": product_id,
            "period": "month",
            "start_at": "2026-03-01",
            "end_at": "2026-04-30",
        },
    )

    assert day_response.status_code == 200
    assert day_response.get_json() == {
        "product_id": product_id,
        "product_title": "RX 9070 XT",
        "granularity": "day",
        "period": "day",
        "start_at": "2026-03-01T00:00:00+00:00",
        "end_at": "2026-03-31T23:59:59.999999+00:00",
        "items": [
            {
                "period_start": "2026-03-02T00:00:00+00:00",
                "captured_at": "2026-03-02T15:00:00+00:00",
                "product_title": "RX 9070 XT",
                "source_product_title": "Placa RX 9070 XT 2",
                "canonical_url": "https://www.kabum.com.br/produto/2/rx-9070-xt",
                "price": "5900.00",
                "currency": "BRL",
                "seller_name": "KaBuM!",
                "search_run_id": day_response.get_json()["items"][0]["search_run_id"],
            },
            {
                "period_start": "2026-03-04T00:00:00+00:00",
                "captured_at": "2026-03-04T12:00:00+00:00",
                "product_title": "RX 9070 XT",
                "source_product_title": "Placa RX 9070 XT 3",
                "canonical_url": "https://www.kabum.com.br/produto/3/rx-9070-xt",
                "price": "5800.00",
                "currency": "BRL",
                "seller_name": "KaBuM!",
                "search_run_id": day_response.get_json()["items"][1]["search_run_id"],
            },
            {
                "period_start": "2026-03-10T00:00:00+00:00",
                "captured_at": "2026-03-10T09:30:00+00:00",
                "product_title": "RX 9070 XT",
                "source_product_title": "Placa RX 9070 XT 4",
                "canonical_url": "https://www.kabum.com.br/produto/4/rx-9070-xt",
                "price": "5700.00",
                "currency": "BRL",
                "seller_name": "KaBuM!",
                "search_run_id": day_response.get_json()["items"][2]["search_run_id"],
            },
        ],
    }
    assert week_response.status_code == 200
    assert [(item["period_start"], item["price"]) for item in week_response.get_json()["items"]] == [
        ("2026-03-02T00:00:00+00:00", "5800.00"),
        ("2026-03-09T00:00:00+00:00", "5700.00"),
    ]
    assert month_response.status_code == 200
    assert [(item["period_start"], item["price"]) for item in month_response.get_json()["items"]] == [
        ("2026-03-01T00:00:00+00:00", "5700.00"),
        ("2026-04-01T00:00:00+00:00", "5600.00"),
    ]


def test_price_history_minimums_endpoint_accepts_granularity_alias(
    monkeypatch, postgres_database_url: str
) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    create_response = client.post(
        "/tracked-products",
        json={"title": "RX 9060 XT", "search_terms": ["RX 9060 XT"]},
    )
    product_id = create_response.get_json()["id"]

    storage = PostgresStorage(postgres_database_url, logging.getLogger("test"))
    search_run_id = storage.create_search_run(
        tracked_product_id=product_id,
        source_name="kabum",
        search_term="RX 9060 XT",
        search_url="https://www.kabum.com.br/busca/rx-9060-xt",
    )
    inserted = storage.persist_search_run_items(
        search_run_id=search_run_id,
        tracked_product_id=product_id,
        items=[
            SearchResultItem(
                source="kabum",
                title="Long scraped RX 9060 XT title",
                canonical_url="https://www.kabum.com.br/produto/9060/rx-9060-xt",
                price=Decimal("3200.00"),
                currency="BRL",
                availability="in_stock",
                is_available=True,
                position=1,
                metadata={"source_product_key": "9060", "seller_name": "KaBuM!"},
            )
        ],
        captured_at=datetime(2026, 3, 6, 12, 0, tzinfo=UTC),
    )
    storage.finish_search_run(
        search_run_id,
        status="succeeded",
        total_results=12,
        matched_results=inserted,
        page_count=1,
        message="lowest_prices_saved",
    )

    response = client.get(
        "/price-history/minimums",
        query_string={
            "product_id": product_id,
            "granularity": "week",
            "start_at": "2026-03-01",
            "end_at": "2026-03-31",
        },
    )

    assert response.status_code == 200
    assert response.get_json()["granularity"] == "week"
    assert response.get_json()["period"] == "week"
    assert response.get_json()["product_title"] == "RX 9060 XT"
    assert response.get_json()["items"][0]["product_title"] == "RX 9060 XT"
    assert response.get_json()["items"][0]["source_product_title"] == "Long scraped RX 9060 XT title"


def test_price_history_minimums_preflight_allows_requested_headers(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    response = client.options(
        "/price-history/minimums",
        headers={
            "Origin": "https://app.example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "content-type,next-router-prefetch,next-url,rsc",
        },
    )

    assert response.status_code == 204
    assert response.headers["Access-Control-Allow-Origin"] == "https://app.example.com"
    assert response.headers["Access-Control-Allow-Methods"] == "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    assert response.headers["Access-Control-Allow-Headers"] == "content-type,next-router-prefetch,next-url,rsc"


def test_price_history_minimums_endpoint_validates_period(monkeypatch, postgres_database_url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", postgres_database_url)
    app = create_app()
    client = app.test_client()

    response = client.get(
        "/price-history/minimums",
        query_string={
            "product_id": "missing",
            "period": "year",
            "start_at": "2026-03-01",
            "end_at": "2026-03-31",
        },
    )

    assert response.status_code == 400
    assert response.get_json() == {
        "error": "period/granularity must be one of: day, week, month."
    }
