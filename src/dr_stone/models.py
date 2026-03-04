from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class ScrapeResult:
    source: str
    canonical_url: str
    title: str
    price: Decimal
    currency: str
    availability: str
    is_available: bool
    fetched_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "canonical_url": self.canonical_url,
            "title": self.title,
            "price": str(self.price),
            "currency": self.currency,
            "availability": self.availability,
            "is_available": self.is_available,
            "fetched_at": self.fetched_at.isoformat(),
            "metadata": self.metadata,
        }
