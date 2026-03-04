from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from dr_stone.exceptions import ParseError


def normalize_currency(value: str | None) -> str:
    if not value:
        return "BRL"

    normalized = value.strip().upper()
    if normalized in {"R$", "BRL"}:
        return "BRL"
    return normalized


def normalize_price(value: str | int | float | Decimal) -> Decimal:
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"))
    if isinstance(value, int | float):
        return Decimal(str(value)).quantize(Decimal("0.01"))

    cleaned = re.sub(r"[^\d,.\-]", "", value.strip())
    if not cleaned:
        raise ParseError("Price value is empty after normalization")

    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")

    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation as exc:
        raise ParseError(f"Unable to parse price value: {value}") from exc


def normalize_availability(value: str | None) -> tuple[str, bool]:
    if not value:
        return "unknown", False

    normalized = value.strip().lower()
    if normalized.endswith("/instock") or normalized in {"in_stock", "instock"}:
        return "in_stock", True
    if normalized.endswith("/outofstock") or normalized in {"out_of_stock", "outofstock"}:
        return "out_of_stock", False
    if "dispon" in normalized:
        return "in_stock", True
    if "indispon" in normalized or "esgot" in normalized:
        return "out_of_stock", False
    return normalized, False
