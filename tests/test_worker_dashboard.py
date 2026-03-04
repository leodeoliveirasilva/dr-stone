from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import entry
import pytest


class FakeRequest:
    def __init__(self, method: str, url: str, payload: dict | None = None):
        self.method = method
        self.url = url
        self._payload = payload

    async def json(self):
        return self._payload


def _make_worker() -> entry.Default:
    worker = entry.Default()
    worker.env = SimpleNamespace(DB=None)
    return worker


def test_root_serves_api_descriptor() -> None:
    worker = _make_worker()

    response = asyncio.run(worker.fetch(FakeRequest("GET", "https://example.com/")))

    assert response.status == 200
    assert response.headers["content-type"] == "application/json"
    payload = json.loads(asyncio.run(response.text()))
    assert payload == {"name": "dr-stone-api", "status": "ok"}


def test_search_runs_route_returns_filtered_runs(monkeypatch) -> None:
    worker = _make_worker()
    captured: dict[str, object] = {}

    async def fake_fetch_search_runs(env, *, date: str | None, limit: int):
        captured["date"] = date
        captured["limit"] = limit
        return [{"id": "run-1", "status": "succeeded", "items": []}]

    monkeypatch.setattr(entry, "_fetch_search_runs", fake_fetch_search_runs)

    response = asyncio.run(worker.fetch(FakeRequest("GET", "https://example.com/search-runs?date=2026-03-04&limit=12")))

    assert response.status == 200
    assert captured == {"date": "2026-03-04", "limit": 12}
    payload = json.loads(asyncio.run(response.text()))
    assert payload == {"date": "2026-03-04", "runs": [{"id": "run-1", "status": "succeeded", "items": []}]}


def test_invalid_search_runs_date_returns_400() -> None:
    worker = _make_worker()

    response = asyncio.run(worker.fetch(FakeRequest("GET", "https://example.com/search-runs?date=03-04-2026")))

    assert response.status == 400
    payload = json.loads(asyncio.run(response.text()))
    assert payload["error"] == "Invalid date. Use YYYY-MM-DD."


def test_put_tracked_product_updates_record(monkeypatch) -> None:
    worker = _make_worker()

    async def fake_update(env, tracked_product_id: str, payload: dict):
        assert tracked_product_id == "prod-1"
        assert payload["title"] == "RTX 5080"
        return {"id": tracked_product_id, "product_title": payload["title"]}

    monkeypatch.setattr(entry, "_update_tracked_product", fake_update)

    response = asyncio.run(worker.fetch(
        FakeRequest(
            "PUT",
            "https://example.com/tracked-products/prod-1",
            payload={"title": "RTX 5080"},
        )
    ))

    assert response.status == 200
    payload = json.loads(asyncio.run(response.text()))
    assert payload == {"id": "prod-1", "product_title": "RTX 5080"}


def test_collect_route_surfaces_runtime_error(monkeypatch) -> None:
    worker = _make_worker()

    async def fake_collect(env, tracked_product_id: str):
        assert tracked_product_id == "prod-1"
        raise RuntimeError("KaBuM search request failed with status 403")

    monkeypatch.setattr(entry, "_collect_one", fake_collect)

    response = asyncio.run(
        worker.fetch(FakeRequest("POST", "https://example.com/tracked-products/prod-1?action=collect"))
    )

    assert response.status == 500
    payload = json.loads(asyncio.run(response.text()))
    assert payload == {
        "error": "KaBuM search request failed with status 403",
        "error_type": "RuntimeError",
    }


def test_bind_params_keeps_none_locally() -> None:
    assert entry._bind_params("a", None, 3) == ("a", None, 3)


def test_platform_fetch_raises_clear_error_without_worker_runtime() -> None:
    with pytest.raises(RuntimeError, match="Cloudflare fetch API is unavailable in this runtime"):
        asyncio.run(entry._platform_fetch("https://example.com"))
