# Mercado Livre Investigation

## Scope

This document records the investigation performed on `2026-03-24` for the new Mercado Livre source in local development and in Railway production.

The goal was to understand why Mercado Livre scraping worked locally, but did not work on the Railway worker.

All timestamps below are shown in UTC, with `America/Sao_Paulo` equivalents when useful.

## Current status

The Mercado Livre source is implemented, enabled on the Railway worker, and the latest worker deployment is healthy.

The production problem is not a build failure. The current blockers are:

- Mercado Livre serves anti-bot or account-verification pages in the Railway/proxy path
- the current proxy session strategy is not yet proven to solve that behavior
- post-deploy validation is currently blocked by the scheduler singleton window, so the patched code has not executed a fresh Mercado Livre run yet

Because of that, there is still no confirmed production success for Mercado Livre on Railway.

## What was implemented

The source was added as a browser-backed adapter in:

- [dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts)
- [dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-parsing.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-parsing.ts)

It was also wired into the runtime and source catalog:

- [dr-stone-scrapper/src/runtime.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/runtime.ts)
- [dr-stone-database/src/sources.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-database/src/sources.ts)
- [dr-stone-scrapper/src/env.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/env.ts)

The source uses the same Cloudflare challenge-script blocking pattern already used by Pichau.

## Investigation timeline

### 1. Local implementation and smoke tests

The Mercado Livre source worked locally in a direct browser flow without the Railway proxy.

Three consecutive live product searches succeeded:

- `RX 9070 XT`
- `RTX 4060`
- `Ryzen 7 7800X3D`

Observed behavior:

- results were extracted successfully
- pagination worked
- seller name was normalized to `Mercado Livre`
- no challenge page was detected in the local non-proxy path

Conclusion:

- the parser and browser-backed source are viable
- the source is not fundamentally broken in local execution

### 2. First production failure analysis on Railway

The first production investigation focused on the Railway worker logs and the `scrape_failures` table.

Observed production pattern before the latest patch:

- Mercado Livre jobs started normally
- the browser was redirected away from the search listing page
- the final URL became `https://www.mercadolivre.com.br/gz/account-verification?...`
- the HTTP status was still `200`
- the page body contained login or account-verification text
- card extraction returned zero candidates
- the error was classified as `mercadolivre_empty_page`

This was confirmed both in:

- Railway runtime logs for `dr-stone-worker`
- `public.scrape_failures`

Representative details observed in production:

- `source_name = mercadolivre`
- `stage = fetch`
- `error_code = mercadolivre_empty_page`
- `http_status = 200`
- `final_url` pointing to `/gz/account-verification`

Conclusion:

- the Railway problem was not a deploy failure
- Mercado Livre was returning an account-verification gate in production
- the source was misclassifying that gate as an empty page instead of a challenge

### 3. Patch added after the first production investigation

A follow-up patch was implemented locally to improve Mercado Livre failure handling.

The patch changed:

- explicit detection for `/gz/account-verification`
- explicit detection for login or account-verification page text
- retry scheduling for retryable Mercado Livre failures
- proxy session rotation at browser launch using `proxyuser-session-<sessionId>`
- retry coverage for navigation timeouts in addition to explicit challenge responses

Relevant files:

- [dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts)
- [dr-stone-scrapper/src/browser/playwright.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/browser/playwright.ts)
- [tests/mercadolivre-source.test.ts](/home/leonardo-silva/workspace/personal/dr-stone/tests/mercadolivre-source.test.ts)

Intended effect:

- classify the Mercado Livre gate as `mercadolivre_challenge_detected`
- retry with a new proxy session when the previous one is challenged or times out

### 4. Local smoke test with the Railway proxy credentials

After the retry and session patch was added, the source was tested locally using the same Railway worker proxy settings.

Observed behavior:

- proxy session rotation worked as intended
- the three retry attempts used distinct session ids
- all three attempts timed out during `page.goto(..., waitUntil: "domcontentloaded")`

Representative attempt sequence:

- attempt 1 used a session id like `rx9070xt-1-...`
- attempt 2 used a session id like `rx9070xt-2-...`
- attempt 3 used a session id like `rx9070xt-3-...`

Conclusion:

- the retry logic is active
- the session rotation logic is active
- the current proxy path is still not enough to reliably reach a usable Mercado Livre page

This is important because it shows that the production issue is not only about error classification. The underlying access problem still exists.

### 5. Deployment of the patch to Railway

The patched worker was deployed directly to Railway production.

Deployment details:

- service: `dr-stone-worker`
- environment: `production`
- deployment id: `a3265e5f-732d-445d-b394-05d607397125`
- deploy created at: `2026-03-24T14:46:13.299Z`
- deploy status: `SUCCESS`

The worker later started successfully with:

- `enabledSources = ["kabum", "amazon", "pichau", "mercadolivre"]`
- container start observed at `2026-03-24T14:48:03.378Z`
- worker startup observed at `2026-03-24T14:48:04.103Z`

Conclusion:

- the patched build is live on Railway
- the worker process is healthy
- the production issue is now operational, not deployment-related

### 6. Post-deploy validation attempt

After deployment, Railway logs and database tables were checked again to validate the new Mercado Livre behavior.

Observed post-deploy results:

- no new `search_runs` were created after `2026-03-24T14:46:13Z`
- no new `scrape_failures` were created after `2026-03-24T14:46:13Z`
- no Mercado Livre retry or challenge logs appeared after deployment

Instead, the worker logs showed:

- `collection_job_schedule_skipped`
- `reason = singleton_conflict`
- `scheduledCount = 0`
- `skippedCount = 20`
- the worker then slept for almost 12 hours

This happened for all tracked products and all enabled sources, including Mercado Livre.

Conclusion:

- the new code is deployed
- the new code has not yet executed a fresh Mercado Livre run in production
- there is still no post-deploy proof that `mercadolivre_challenge_detected` is being emitted on Railway

## Queue investigation

The scheduling behavior was traced in:

- [dr-stone-scrapper/src/services/collection-job-scheduler.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/services/collection-job-scheduler.ts)

The important queue behavior is:

- queue name: `search-collection`
- pgBoss queue policy: `singleton`
- non-forced scheduling uses `singletonSeconds = settings.intervalSeconds`
- the current worker interval is `43200` seconds
- `43200` seconds is `12` hours
- the per-job singleton key is `${trackedProduct.id}:${sourceName}`

That means a previous job for the same tracked product and source blocks re-enqueueing for 12 hours, even if the previous job already failed.

Production queue inspection confirmed that there were no active jobs blocking the queue. The blocking jobs were already completed or failed, but they still occupied the singleton window.

Observed queue states for `pgboss.job` and `name = 'search-collection'`:

- `completed = 133`
- `failed = 26`

Recent Mercado Livre jobs in `pgboss.job`:

- created around `2026-03-24T14:01:19Z`
- failed between `2026-03-24T14:04:31Z` and `2026-03-24T14:10:57Z`

Representative singleton keys:

- `1330e541358c4662a81805eba1b241a3:mercadolivre`
- `7295cd1cc5514d888f8882bd0f049aba:mercadolivre`
- `047c7a15711b421e82b065e35b08eb7f:mercadolivre`
- `e9d12b5285e143bf9b4cc8afc06c2b1f:mercadolivre`
- `21a661ea252f48b8a067521528e8a3e9:mercadolivre`

Effect on validation:

- the failed Mercado Livre jobs were created at about `14:01Z`
- the singleton window lasts until about `02:01Z` on `2026-03-25` UTC
- in `America/Sao_Paulo`, that is about `23:01` on `2026-03-24`
- the deploy at `14:46Z` happened inside that still-active singleton window

So the worker restart could not schedule replacement Mercado Livre jobs for the same tracked products.

## Identified problems that still need to be solved

### Problem 1. Mercado Livre returns anti-bot or account-verification responses in the Railway path

Evidence:

- production requests ended on `/gz/account-verification`
- page responses were `200`, but the content was a login or verification gate
- local direct browser execution worked, while the Railway or proxy path did not
- local proxy-backed smoke test still timed out after session rotation

Impact:

- the source cannot reliably collect listing pages in production
- results may fail before parsing starts

What still needs to be solved:

- validate whether the current proxy provider and session format are acceptable for Mercado Livre
- determine whether the worker needs a different proxy type, region, or sticky-session policy
- verify whether additional browser warm-up steps are needed before hitting search pages
- capture screenshots, HTML snippets, and final URLs for every failed retry attempt in production

### Problem 2. Retry and session rotation are implemented, but not yet proven in production

Evidence:

- the code now rotates proxy session ids and retries on challenge or timeout
- local proxy-backed smoke test proved the retry loop is active
- post-deploy Railway validation never executed a fresh Mercado Livre job because of singleton conflicts

Impact:

- the production effectiveness of the patch is still unknown
- the code may be correct, but there is no runtime proof yet

What still needs to be solved:

- trigger a fresh Mercado Livre run outside the singleton window or bypass the singleton restriction
- confirm in Railway logs whether the new code emits:
  - `search_source_retry_scheduled`
  - `mercadolivre_challenge_detected`
  - `mercadolivre_results_timeout`

### Problem 3. The 12-hour singleton window blocks operational validation after failures

Evidence:

- `CollectionJobScheduler` uses `singletonSeconds = settings.intervalSeconds`
- production interval is `43200` seconds
- failed Mercado Livre jobs from `14:01Z` blocked re-enqueueing during the `14:46Z` deploy validation

Impact:

- a normal redeploy does not re-run the failed source immediately
- debugging and operational validation are much slower than they need to be
- a fix can be deployed but remain untested for hours

What still needs to be solved:

- add an operator path to enqueue with `force: true`
- or add a dedicated debug command or admin endpoint that bypasses singleton keys
- or reduce the singleton window when the previous run failed with a retryable anti-bot error
- or add a source-specific manual rerun workflow for Railway operations

### Problem 4. The worker sleep interval hides the distinction between "healthy deploy" and "successful source execution"

Evidence:

- the worker started correctly and reported `SUCCESS`
- the same worker then scheduled `0` jobs and slept for almost 12 hours
- post-deploy tables showed zero new `search_runs` and zero new `scrape_failures`

Impact:

- a healthy deployment can look successful even when the new code did not execute
- this makes production verification easy to misread

What still needs to be solved:

- log a stronger warning when all source schedules are skipped because of singleton conflicts
- expose a metric or dashboard signal for `scheduledCount = 0`
- make post-deploy verification depend on observed `search_runs`, not only deployment status

### Problem 5. The original Mercado Livre error taxonomy was too weak

Evidence:

- the account-verification page was first recorded as `mercadolivre_empty_page`
- that classification hid the real failure mode

Impact:

- false diagnosis
- slower root-cause analysis

Current state:

- the code was patched locally and deployed to classify account-verification pages as `mercadolivre_challenge_detected`
- this is improved, but still not validated by a post-deploy Railway execution

What still needs to be solved:

- confirm the new code path appears in fresh production runs
- keep the richer diagnostics in `scrape_failures`

## Non-blocking note

There was also an earlier environment observation that `DR_STONE_ENABLED_SOURCES` was set on `dr-stone-worker`, but not set on `dr-stone-api`.

This does not explain the worker scraping failure, but it may still matter if the API is expected to reflect Mercado Livre as an active source in production.

## Recommended next steps

1. Force a fresh Mercado Livre run in production without waiting for the 12-hour singleton window.
2. Confirm whether the new deployment now records `mercadolivre_challenge_detected` instead of `mercadolivre_empty_page`.
3. If the source still times out or hits account verification, review the proxy provider, region, and session behavior.
4. Capture more production evidence per failed attempt, especially screenshot, final URL, response snippet, and attempt number.
5. Add an operational rerun path so source fixes can be validated immediately after deployment.

## Queries and commands used during the investigation

Railway status and deployment checks:

- `railway status --json`
- `railway service status --all --json`
- `railway deployment list --service dr-stone-worker --limit 5 --json`
- `railway logs --service dr-stone-worker --environment production --since 30m --lines 250 --json`

Database checks:

- `select captured_at, source_name, stage, error_code, http_status, final_url from scrape_failures ...`
- `select started_at, source_name, status, total_results, matched_results from search_runs ...`
- `select state, count(*) from pgboss.job where name = 'search-collection' group by state`
- `select id, singleton_key, state, created_on, started_on, completed_on from pgboss.job where name = 'search-collection' order by created_on desc limit 20`

Code paths reviewed:

- [dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/sources/mercadolivre/mercadolivre-source.ts)
- [dr-stone-scrapper/src/browser/playwright.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/browser/playwright.ts)
- [dr-stone-scrapper/src/services/collection-job-scheduler.ts](/home/leonardo-silva/workspace/personal/dr-stone/dr-stone-scrapper/src/services/collection-job-scheduler.ts)
- [tests/mercadolivre-source.test.ts](/home/leonardo-silva/workspace/personal/dr-stone/tests/mercadolivre-source.test.ts)
