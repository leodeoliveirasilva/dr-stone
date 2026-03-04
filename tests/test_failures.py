from __future__ import annotations

from dr_stone.exceptions import FetchError, ParseError
from dr_stone.failures import build_scrape_failure


def test_build_scrape_failure_from_fetch_error() -> None:
    error = FetchError(
        "Request timed out",
        code="timeout",
        retriable=True,
        status_code=504,
        url="https://example.com/item",
        final_url="https://example.com/item",
        details={"attempt": 2},
    )

    failure = build_scrape_failure("kabum", "https://example.com/item", error)

    assert failure.stage == "fetch"
    assert failure.error_code == "timeout"
    assert failure.retriable is True
    assert failure.http_status == 504
    assert failure.details["attempt"] == 2


def test_build_scrape_failure_from_parse_error() -> None:
    error = ParseError("Missing title", code="missing_title", details={"field": "title"})

    failure = build_scrape_failure("kabum", "https://example.com/item", error)

    assert failure.stage == "parse"
    assert failure.error_code == "missing_title"
    assert failure.retriable is False
    assert failure.details["field"] == "title"
