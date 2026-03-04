from __future__ import annotations

import logging
import time
from collections.abc import Callable

import httpx

from dr_stone.config import Settings
from dr_stone.exceptions import FetchError


class HttpFetcher:
    def __init__(
        self,
        settings: Settings,
        logger: logging.Logger,
        *,
        client: httpx.Client | None = None,
        sleep_func: Callable[[float], None] | None = None,
    ) -> None:
        self.settings = settings
        self.logger = logger
        self.client = client or httpx.Client(
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
        self.sleep_func = sleep_func or time.sleep

    def get(self, url: str) -> httpx.Response:
        last_error: FetchError | None = None

        for attempt in range(1, self.settings.max_retries + 2):
            try:
                self._pace_request(attempt)
                response = self.client.get(url)
                if response.status_code >= 500:
                    raise self._build_http_error(response)
                if response.status_code >= 400:
                    raise self._build_http_error(response)
                if not response.text.strip():
                    raise FetchError(
                        "Response body is empty",
                        code="empty_body",
                        retriable=False,
                        status_code=response.status_code,
                        url=url,
                        final_url=str(response.url),
                        details={"redirect_count": len(response.history)},
                    )
                self.logger.info(
                    "http_fetch_succeeded",
                    extra={
                        "event_data": {
                            "url": str(response.url),
                            "status_code": response.status_code,
                            "attempt": attempt,
                            "redirect_count": len(response.history),
                        }
                    },
                )
                return response
            except FetchError as exc:
                last_error = exc
                self._log_failure(url, attempt, exc)
                if not exc.retriable or attempt > self.settings.max_retries:
                    break
                self.sleep_func(self.settings.retry_backoff_seconds * attempt)
            except httpx.TimeoutException as exc:
                last_error = FetchError(
                    "Request timed out",
                    code="timeout",
                    retriable=True,
                    url=url,
                    details={"error": str(exc)},
                )
                self._log_failure(url, attempt, last_error)
                if attempt > self.settings.max_retries:
                    break
                self.sleep_func(self.settings.retry_backoff_seconds * attempt)
            except httpx.TooManyRedirects as exc:
                last_error = FetchError(
                    "Too many redirects while fetching page",
                    code="too_many_redirects",
                    retriable=False,
                    url=url,
                    details={"error": str(exc)},
                )
                self._log_failure(url, attempt, last_error)
                break
            except (httpx.NetworkError, httpx.InvalidURL) as exc:
                last_error = FetchError(
                    "Network error while fetching page",
                    code="network_error",
                    retriable=True,
                    url=url,
                    details={"error": str(exc)},
                )
                self._log_failure(url, attempt, last_error)
                if attempt > self.settings.max_retries:
                    break
                self.sleep_func(self.settings.retry_backoff_seconds * attempt)
            except httpx.HTTPError as exc:
                last_error = FetchError(
                    "Unexpected HTTP client error",
                    code="http_client_error",
                    retriable=False,
                    url=url,
                    details={"error": str(exc)},
                )
                self._log_failure(url, attempt, last_error)
                break

        raise last_error or FetchError(f"Unable to fetch {url}", url=url)

    def _pace_request(self, attempt: int) -> None:
        if attempt == 1 and self.settings.request_delay_seconds > 0:
            self.sleep_func(self.settings.request_delay_seconds)

    def _build_http_error(self, response: httpx.Response) -> FetchError:
        status_code = response.status_code
        retriable = status_code >= 500
        code = "http_server_error" if retriable else "http_client_error"
        return FetchError(
            f"HTTP request failed with status {status_code}",
            code=code,
            retriable=retriable,
            status_code=status_code,
            url=str(response.request.url),
            final_url=str(response.url),
            details={"redirect_count": len(response.history)},
        )

    def _log_failure(self, url: str, attempt: int, error: FetchError) -> None:
        self.logger.warning(
            "http_fetch_failed",
            extra={
                "event_data": {
                    "url": url,
                    "attempt": attempt,
                    "error": str(error),
                    "error_code": error.code,
                    "retriable": error.retriable,
                    "status_code": error.status_code,
                }
            },
        )

    def close(self) -> None:
        self.client.close()
