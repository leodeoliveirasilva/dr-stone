from __future__ import annotations

import logging
import time

import httpx

from dr_stone.config import Settings
from dr_stone.exceptions import FetchError


class HttpFetcher:
    def __init__(self, settings: Settings, logger: logging.Logger) -> None:
        self.settings = settings
        self.logger = logger
        self.client = httpx.Client(
            headers={
                "User-Agent": settings.user_agent,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
            },
            follow_redirects=True,
            timeout=settings.timeout_seconds,
        )

    def get(self, url: str) -> httpx.Response:
        last_error: Exception | None = None

        for attempt in range(1, self.settings.max_retries + 2):
            try:
                response = self.client.get(url)
                if response.status_code >= 500 and attempt <= self.settings.max_retries:
                    raise httpx.HTTPStatusError(
                        "Retryable server error",
                        request=response.request,
                        response=response,
                    )

                response.raise_for_status()
                self.logger.info(
                    "http_fetch_succeeded",
                    extra={
                        "event_data": {
                            "url": str(response.url),
                            "status_code": response.status_code,
                            "attempt": attempt,
                        }
                    },
                )
                return response
            except (httpx.HTTPError, httpx.InvalidURL) as exc:
                last_error = exc
                self.logger.warning(
                    "http_fetch_failed",
                    extra={
                        "event_data": {
                            "url": url,
                            "attempt": attempt,
                            "error": str(exc),
                        }
                    },
                )
                if attempt > self.settings.max_retries:
                    break
                time.sleep(self.settings.retry_backoff_seconds * attempt)

        raise FetchError(f"Unable to fetch {url}: {last_error}") from last_error

    def close(self) -> None:
        self.client.close()
