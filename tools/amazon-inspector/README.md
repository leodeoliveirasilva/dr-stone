# Amazon Inspector

This folder contains a small TypeScript + Playwright harness for probing whether Amazon.com.br exposes usable data once a real browser session is involved.

## Purpose

Use this before writing production crawler code.

The script is designed to answer practical questions:

- does the browser still hit an AWS WAF challenge?
- do search pages expose real listing cards in the DOM?
- do product pages expose title, price, and seller data?
- are there useful XHR or fetch calls after page load?

## Install

From this folder:

```bash
npm install
npx playwright install chromium
```

## Runtime note

This inspector required Node `18.19+` during the probe work.

The default Node on this machine was `18.0.0`, so the working runs used `nvm` with Node `24.14.0`.

## Run

Search page probe:

```bash
AMAZON_TARGET_URL='https://www.amazon.com.br/s?k=rx+9070+xt' npm run inspect
```

Product page probe:

```bash
AMAZON_TARGET_URL='https://www.amazon.com.br/dp/B0DZY3G4V4' npm run inspect
```

Headed mode:

```bash
HEADED=1 AMAZON_TARGET_URL='https://www.amazon.com.br/s?k=rx+9070+xt' npm run inspect:headed
```

## Output

Playwright stores artifacts under its test output directory.

The important files are:

- `artifacts/report.json`
- `artifacts/page.png`

## Interpreting results

Good signs:

- `summary.detectedSearchResults` is `true`
- `summary.detectedProductPage` is `true`
- `challengeSignals` is empty or limited to bootstrap markers that disappear after navigation
- XHR responses contain structured search or offer data

Bad signs:

- `summary.detectedErrorPage` is `true`
- `summary.detectedChallenge` stays `true`
- the page only shows generic error or robot-check content
- no product/listing data appears in DOM or XHR traffic
