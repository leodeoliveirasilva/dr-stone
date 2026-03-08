from __future__ import annotations

from dr_stone.matching import title_contains_all_terms


def test_title_contains_all_terms_ignores_case() -> None:
    assert title_contains_all_terms(
        ["rx 9070 xt", "sapphire pulse"],
        "Placa de Video Sapphire Pulse Radeon RX 9070 XT 16GB",
    )


def test_title_contains_all_terms_rejects_partial_matches() -> None:
    assert not title_contains_all_terms(
        ["RX 9070 XT", "Sapphire"],
        "Placa de Video GeForce RTX 5070 12GB",
    )
