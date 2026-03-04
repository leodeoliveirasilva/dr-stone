from __future__ import annotations

import logging

import httpx
import pytest

from dr_stone.config import Settings
from dr_stone.exceptions import FetchError
from dr_stone.http import HttpFetcher


def test_fetcher_retries_server_error_then_succeeds() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] == 1:
            return httpx.Response(503, request=request, text="temporary failure")
        return httpx.Response(200, request=request, text="<html>ok</html>")

    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)
    fetcher = HttpFetcher(
        Settings(max_retries=1, retry_backoff_seconds=0, request_delay_seconds=0),
        logging.getLogger("test"),
        client=client,
        sleep_func=lambda _: None,
    )

    response = fetcher.get("https://example.com/item")

    assert response.status_code == 200
    assert calls["count"] == 2
    fetcher.close()


def test_fetcher_does_not_retry_client_error() -> None:
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        return httpx.Response(404, request=request, text="not found")

    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)
    fetcher = HttpFetcher(
        Settings(max_retries=3, retry_backoff_seconds=0, request_delay_seconds=0),
        logging.getLogger("test"),
        client=client,
        sleep_func=lambda _: None,
    )

    with pytest.raises(FetchError) as excinfo:
        fetcher.get("https://example.com/missing")

    assert excinfo.value.code == "http_client_error"
    assert excinfo.value.retriable is False
    assert calls["count"] == 1
    fetcher.close()


def test_fetcher_raises_on_empty_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, request=request, text="   ")

    client = httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=True)
    fetcher = HttpFetcher(
        Settings(max_retries=0, retry_backoff_seconds=0, request_delay_seconds=0),
        logging.getLogger("test"),
        client=client,
        sleep_func=lambda _: None,
    )

    with pytest.raises(FetchError) as excinfo:
        fetcher.get("https://example.com/empty")

    assert excinfo.value.code == "empty_body"
    fetcher.close()
