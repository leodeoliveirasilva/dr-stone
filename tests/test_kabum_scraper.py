from __future__ import annotations

import logging
from decimal import Decimal

from dr_stone.config import Settings
from dr_stone.http import HttpFetcher
from dr_stone.scrapers.kabum import KabumScraper


def test_kabum_parser_extracts_normalized_product_data(kabum_html: str) -> None:
    fetcher = HttpFetcher(Settings(), logging.getLogger("test"))
    scraper = KabumScraper(fetcher, logging.getLogger("test"))

    result = scraper.parse_html(
        kabum_html,
        "https://www.kabum.com.br/produto/210818/placa-de-video-palit-nvidia-geforce-rtx-3080-gamingpro-10gb-gddr6x-ned3080019ia-132aa",
    )

    assert result.source == "kabum"
    assert result.title.startswith("Placa de Vídeo Palit NVIDIA GeForce RTX 3080")
    assert result.price == Decimal("6999.99")
    assert result.currency == "BRL"
    assert result.availability == "in_stock"
    assert result.is_available is True
    assert result.metadata["brand"] == "PALIT"
    assert result.metadata["sku"] == "210818"

    fetcher.close()
