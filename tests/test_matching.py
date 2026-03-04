from __future__ import annotations

from dr_stone.matching import title_contains_expected


def test_title_contains_expected_ignores_case() -> None:
    assert title_contains_expected(
        "RX 9070 XT",
        "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
    )


def test_title_contains_expected_rejects_unmatched_titles() -> None:
    assert not title_contains_expected(
        "RX 9070 XT",
        "Placa de Video GeForce RTX 5070 12GB",
    )
