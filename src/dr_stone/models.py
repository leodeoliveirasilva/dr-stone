from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class ScrapeFailure:
    source: str
    stage: str
    error_code: str
    error_type: str
    message: str
    target_url: str
    retriable: bool
    http_status: int | None = None
    final_url: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    captured_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "stage": self.stage,
            "error_code": self.error_code,
            "error_type": self.error_type,
            "message": self.message,
            "target_url": self.target_url,
            "retriable": self.retriable,
            "http_status": self.http_status,
            "final_url": self.final_url,
            "details": self.details,
            "captured_at": self.captured_at.isoformat(),
        }


@dataclass(frozen=True, slots=True)
class TrackedProduct:
    id: str
    product_title: str
    search_terms: list[str]
    active: bool
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "product_title": self.product_title,
            "search_terms": self.search_terms,
            "active": self.active,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass(frozen=True, slots=True)
class SearchResultItem:
    source: str
    title: str
    canonical_url: str
    price: Decimal
    currency: str
    availability: str
    is_available: bool
    position: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "title": self.title,
            "canonical_url": self.canonical_url,
            "price": str(self.price),
            "currency": self.currency,
            "availability": self.availability,
            "is_available": self.is_available,
            "position": self.position,
            "metadata": self.metadata,
        }


@dataclass(frozen=True, slots=True)
class SearchRunResult:
    source: str
    search_term: str
    resolved_url: str
    total_results: int
    page_count: int
    items: list[SearchResultItem]
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "search_term": self.search_term,
            "resolved_url": self.resolved_url,
            "total_results": self.total_results,
            "page_count": self.page_count,
            "items": [item.to_dict() for item in self.items],
            "fetched_at": self.fetched_at.isoformat(),
            "metadata": self.metadata,
        }


@dataclass(frozen=True, slots=True)
class SearchCollectionResult:
    tracked_product_id: str
    search_run_ids: list[str]
    successful_runs: int
    failed_runs: int
    total_results: int
    matched_results: int
    page_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "tracked_product_id": self.tracked_product_id,
            "search_run_ids": self.search_run_ids,
            "successful_runs": self.successful_runs,
            "failed_runs": self.failed_runs,
            "total_results": self.total_results,
            "matched_results": self.matched_results,
            "page_count": self.page_count,
        }


@dataclass(frozen=True, slots=True)
class SearchHistoryEntry:
    captured_at: datetime
    product_title: str
    canonical_url: str
    price: Decimal
    currency: str
    seller_name: str | None
    search_run_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "captured_at": self.captured_at.isoformat(),
            "product_title": self.product_title,
            "canonical_url": self.canonical_url,
            "price": str(self.price),
            "currency": self.currency,
            "seller_name": self.seller_name,
            "search_run_id": self.search_run_id,
        }
