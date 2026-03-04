# Dr. Stone

Dr. Stone is a price-tracking project focused on collecting product data from the web and storing its history over time.

The current implementation covers the first scraping foundation:

- Python 3.12 package structure
- HTTP-first fetcher with retries and configurable headers
- normalization helpers for price, currency, and availability
- structured JSON logging
- a first `kabum.com.br` scraper that reads server-rendered data
- fixture-based pytest coverage for the KaBuM parser

## Current KaBuM Strategy

The first scraper is built around HTML that KaBuM already returns on the initial request:

- parse `application/ld+json` product data first
- fall back to `__NEXT_DATA__` when needed
- avoid browser rendering unless HTTP-first extraction stops being reliable

## Project Layout

- `src/dr_stone/`: scraping package
- `src/dr_stone/scrapers/`: source adapters
- `tests/`: pytest suite
- `fixtures/`: HTML fixtures for parser development
- `scripts/`: small entrypoints for local execution

## Quick Start

Install dependencies into a local target directory:

```bash
python3 -m pip install --target .deps beautifulsoup4 httpx lxml pytest
```

Run tests:

```bash
PYTHONPATH=src:.deps python3 -m pytest
```

Run the KaBuM scraper:

```bash
PYTHONPATH=src:.deps python3 -m dr_stone.cli "https://www.kabum.com.br/produto/210818/placa-de-video-palit-nvidia-geforce-rtx-3080-gamingpro-10gb-gddr6x-ned3080019ia-132aa"
```

Environment variables are documented in `.env.example`.
