from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import entry
import pytest


class FakeRequest:
    def __init__(self, method: str, url: str, payload: dict | None = None, headers: dict[str, str] | None = None):
        self.method = method
        self.url = url
        self._payload = payload
        self.headers = headers or {}

    async def json(self):
        return self._payload


class _FakeLatestRunStatement:
    def __init__(self, rows_by_product_id: dict[str, dict | None]):
        self._rows_by_product_id = rows_by_product_id
        self._tracked_product_id = ""

    def bind(self, tracked_product_id: str):
        self._tracked_product_id = str(tracked_product_id)
        return self

    async def first(self):
        return self._rows_by_product_id.get(self._tracked_product_id)


class _FakeLatestRunDB:
    def __init__(self, rows_by_product_id: dict[str, dict | None]):
        self._rows_by_product_id = rows_by_product_id

    def prepare(self, _query: str):
        return _FakeLatestRunStatement(self._rows_by_product_id)


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


def test_preflight_allows_frontend_origin() -> None:
    worker = _make_worker()

    response = asyncio.run(
        worker.fetch(
            FakeRequest(
                "OPTIONS",
                "https://example.com/tracked-products",
                headers={
                    "origin": "https://drstone.leogendaryo.com",
                    "access-control-request-method": "POST",
                    "access-control-request-headers": "content-type",
                },
            )
        )
    )

    assert response.status == 204
    assert response.headers["access-control-allow-origin"] == "https://drstone.leogendaryo.com"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"]
    assert response.headers["access-control-max-age"] == "86400"


def test_preflight_rejects_unlisted_origin() -> None:
    worker = _make_worker()

    response = asyncio.run(
        worker.fetch(
            FakeRequest(
                "OPTIONS",
                "https://example.com/tracked-products",
                headers={
                    "origin": "https://evil.example",
                    "access-control-request-method": "POST",
                    "access-control-request-headers": "content-type",
                },
            )
        )
    )

    assert response.status == 204
    assert "access-control-allow-origin" not in response.headers


def test_get_includes_cors_headers_for_allowed_localhost_origin() -> None:
    worker = _make_worker()

    response = asyncio.run(
        worker.fetch(
            FakeRequest(
                "GET",
                "https://example.com/",
                headers={"origin": "http://localhost:5173"},
            )
        )
    )

    assert response.status == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["vary"] == "Origin"


def test_collect_due_retries_stale_running_run(monkeypatch) -> None:
    started_at = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    env = SimpleNamespace(DB=_FakeLatestRunDB({"prod-1": {"status": "running", "started_at": started_at}}))

    async def fake_fetch_all(env, *, include_inactive: bool):
        assert include_inactive is False
        return [{"id": "prod-1", "scrapes_per_day": 4}]

    async def fake_collect(env, tracked_product: dict):
        return {"tracked_product_id": tracked_product["id"]}

    monkeypatch.setattr(entry, "_fetch_all_tracked_products", fake_fetch_all)
    monkeypatch.setattr(entry, "_collect_tracked_product", fake_collect)

    results = asyncio.run(entry._collect_due(env))

    assert results == [{"tracked_product_id": "prod-1"}]


def test_collect_due_skips_fresh_running_run(monkeypatch) -> None:
    started_at = (datetime.now(UTC) - timedelta(minutes=10)).isoformat()
    env = SimpleNamespace(DB=_FakeLatestRunDB({"prod-1": {"status": "running", "started_at": started_at}}))

    async def fake_fetch_all(env, *, include_inactive: bool):
        assert include_inactive is False
        return [{"id": "prod-1", "scrapes_per_day": 4}]

    async def fake_collect(env, tracked_product: dict):
        raise AssertionError("fresh running job should not be recollected")

    monkeypatch.setattr(entry, "_fetch_all_tracked_products", fake_fetch_all)
    monkeypatch.setattr(entry, "_collect_tracked_product", fake_collect)

    results = asyncio.run(entry._collect_due(env))

    assert results == []


def test_collect_due_collects_when_latest_timestamp_is_invalid(monkeypatch) -> None:
    env = SimpleNamespace(DB=_FakeLatestRunDB({"prod-1": {"status": "succeeded", "started_at": "not-a-date"}}))

    async def fake_fetch_all(env, *, include_inactive: bool):
        assert include_inactive is False
        return [{"id": "prod-1", "scrapes_per_day": 4}]

    async def fake_collect(env, tracked_product: dict):
        return {"tracked_product_id": tracked_product["id"]}

    monkeypatch.setattr(entry, "_fetch_all_tracked_products", fake_fetch_all)
    monkeypatch.setattr(entry, "_collect_tracked_product", fake_collect)

    results = asyncio.run(entry._collect_due(env))

    assert results == [{"tracked_product_id": "prod-1"}]


def test_collect_due_continues_after_one_product_failure(monkeypatch) -> None:
    old_finished = (datetime.now(UTC) - timedelta(hours=7)).isoformat()
    env = SimpleNamespace(
        DB=_FakeLatestRunDB(
            {
                "prod-1": {"status": "succeeded", "started_at": old_finished, "finished_at": old_finished},
                "prod-2": {"status": "succeeded", "started_at": old_finished, "finished_at": old_finished},
            }
        )
    )

    async def fake_fetch_all(env, *, include_inactive: bool):
        assert include_inactive is False
        return [
            {"id": "prod-1", "scrapes_per_day": 4},
            {"id": "prod-2", "scrapes_per_day": 4},
        ]

    async def fake_collect(env, tracked_product: dict):
        if tracked_product["id"] == "prod-1":
            raise RuntimeError("kabum unavailable")
        return {"tracked_product_id": tracked_product["id"]}

    monkeypatch.setattr(entry, "_fetch_all_tracked_products", fake_fetch_all)
    monkeypatch.setattr(entry, "_collect_tracked_product", fake_collect)

    results = asyncio.run(entry._collect_due(env))

    assert results == [{"tracked_product_id": "prod-2"}]
