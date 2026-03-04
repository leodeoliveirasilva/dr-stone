from __future__ import annotations

from abc import ABC, abstractmethod

from dr_stone.models import ScrapeResult


class BaseScraper(ABC):
    source_name: str

    @abstractmethod
    def can_handle(self, url: str) -> bool: ...

    @abstractmethod
    def scrape(self, url: str) -> ScrapeResult: ...
