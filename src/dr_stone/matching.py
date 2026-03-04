from __future__ import annotations

import unicodedata


def title_contains_expected(expected_title: str, candidate_title: str) -> bool:
    return normalize_title(expected_title) in normalize_title(candidate_title)


def normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.casefold().split())
