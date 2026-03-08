from __future__ import annotations

from collections.abc import Iterable

MAX_SEARCH_TERMS = 5


def clean_search_term(value: object) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text or None


def normalize_search_terms(values: Iterable[object]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for value in values:
        term = clean_search_term(value)
        if term is None:
            continue
        key = term.casefold()
        if key in seen:
            continue
        normalized.append(term)
        seen.add(key)

    if not normalized:
        raise ValueError("search_terms must contain at least one non-empty term.")
    if len(normalized) > MAX_SEARCH_TERMS:
        raise ValueError(f"search_terms must contain at most {MAX_SEARCH_TERMS} terms.")
    return normalized


def build_search_query(search_terms: list[str]) -> str:
    return " ".join(search_terms)
