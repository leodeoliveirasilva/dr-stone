from __future__ import annotations

import unicodedata


def title_contains_all_terms(search_terms: list[str], candidate_title: str) -> bool:
    normalized_candidate = normalize_title(candidate_title)
    return all(normalize_title(term) in normalized_candidate for term in search_terms)


def normalize_title(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return " ".join(normalized.casefold().split())
