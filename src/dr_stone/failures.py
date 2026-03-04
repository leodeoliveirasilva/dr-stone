from __future__ import annotations

from dr_stone.exceptions import FetchError, ParseError
from dr_stone.models import ScrapeFailure


def build_scrape_failure(source: str, target_url: str, exc: Exception) -> ScrapeFailure:
    if isinstance(exc, FetchError):
        return ScrapeFailure(
            source=source,
            stage="fetch",
            error_code=exc.code,
            error_type=type(exc).__name__,
            message=str(exc),
            target_url=exc.url or target_url,
            retriable=exc.retriable,
            http_status=exc.status_code,
            final_url=exc.final_url,
            details=exc.details,
        )

    if isinstance(exc, ParseError):
        return ScrapeFailure(
            source=source,
            stage="parse",
            error_code=exc.code,
            error_type=type(exc).__name__,
            message=str(exc),
            target_url=target_url,
            retriable=False,
            details=exc.details,
        )

    return ScrapeFailure(
        source=source,
        stage="unknown",
        error_code="unexpected_error",
        error_type=type(exc).__name__,
        message=str(exc),
        target_url=target_url,
        retriable=False,
    )
