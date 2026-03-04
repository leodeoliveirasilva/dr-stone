from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
)


@dataclass(frozen=True, slots=True)
class Settings:
    timeout_seconds: float = 15.0
    max_retries: int = 2
    retry_backoff_seconds: float = 1.0
    log_level: str = "INFO"
    user_agent: str = DEFAULT_USER_AGENT

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            timeout_seconds=float(os.getenv("DR_STONE_TIMEOUT_SECONDS", "15")),
            max_retries=int(os.getenv("DR_STONE_MAX_RETRIES", "2")),
            retry_backoff_seconds=float(
                os.getenv("DR_STONE_RETRY_BACKOFF_SECONDS", "1.0")
            ),
            log_level=os.getenv("DR_STONE_LOG_LEVEL", "INFO").upper(),
            user_agent=os.getenv("DR_STONE_USER_AGENT", DEFAULT_USER_AGENT),
        )
