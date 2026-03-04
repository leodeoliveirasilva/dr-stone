from __future__ import annotations

from decimal import Decimal

import pytest

from dr_stone.normalizers import (
    normalize_availability,
    normalize_currency,
    normalize_price,
)


@pytest.mark.parametrize(
    ("raw_price", "expected"),
    [
        ("R$ 6.999,99", Decimal("6999.99")),
        ("6999.99", Decimal("6999.99")),
        (6999.99, Decimal("6999.99")),
    ],
)
def test_normalize_price(raw_price: str | float, expected: Decimal) -> None:
    assert normalize_price(raw_price) == expected


@pytest.mark.parametrize(
    ("raw_currency", "expected"),
    [
        ("R$", "BRL"),
        ("brl", "BRL"),
        ("USD", "USD"),
    ],
)
def test_normalize_currency(raw_currency: str, expected: str) -> None:
    assert normalize_currency(raw_currency) == expected


@pytest.mark.parametrize(
    ("raw_availability", "expected"),
    [
        ("https://schema.org/InStock", ("in_stock", True)),
        ("out_of_stock", ("out_of_stock", False)),
        ("Produto disponível", ("in_stock", True)),
    ],
)
def test_normalize_availability(
    raw_availability: str, expected: tuple[str, bool]
) -> None:
    assert normalize_availability(raw_availability) == expected
