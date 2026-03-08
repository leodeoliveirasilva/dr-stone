from __future__ import annotations

from dr_stone.api import create_app


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
        json={"title": "RX 9070 XT", "search_term": "RX 9070 XT"},
    )

    assert create_response.status_code == 201
    tracked_product = create_response.get_json()
    tracked_product_id = tracked_product["id"]

    list_response = client.get("/tracked-products")
    history_response = client.get(f"/tracked-products/{tracked_product_id}")
    delete_response = client.delete(f"/tracked-products/{tracked_product_id}")
    missing_response = client.get(f"/tracked-products/{tracked_product_id}")

    assert list_response.status_code == 200
    assert len(list_response.get_json()) == 1
    assert history_response.status_code == 200
    assert history_response.get_json()["product_title"] == "RX 9070 XT"
    assert delete_response.status_code == 204
    assert missing_response.status_code == 404
