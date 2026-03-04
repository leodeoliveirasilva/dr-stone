from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def kabum_html() -> str:
    fixture_path = Path(__file__).resolve().parents[1] / "fixtures" / "kabum_product_page.html"
    return fixture_path.read_text(encoding="utf-8")
