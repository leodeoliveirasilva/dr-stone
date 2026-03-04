from __future__ import annotations


def render_dashboard_html() -> str:
    return """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dr. Stone Control Room</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe6;
        --bg-strong: #eadfce;
        --panel: rgba(255, 250, 242, 0.8);
        --panel-strong: rgba(255, 248, 236, 0.96);
        --ink: #1f2421;
        --muted: #5a6259;
        --accent: #d65a31;
        --accent-soft: rgba(214, 90, 49, 0.14);
        --accent-alt: #1f7a5c;
        --border: rgba(31, 36, 33, 0.12);
        --shadow: 0 24px 60px rgba(76, 55, 34, 0.14);
        --radius: 24px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(214, 90, 49, 0.16), transparent 32%),
          radial-gradient(circle at 85% 20%, rgba(31, 122, 92, 0.12), transparent 24%),
          linear-gradient(180deg, #f9f4eb 0%, var(--bg) 50%, #efe3d1 100%);
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.35;
        background-image: repeating-linear-gradient(
          0deg,
          rgba(64, 47, 28, 0.04) 0,
          rgba(64, 47, 28, 0.04) 1px,
          transparent 1px,
          transparent 5px
        );
      }

      .shell {
        position: relative;
        width: min(1400px, calc(100% - 32px));
        margin: 24px auto 40px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: calc(var(--radius) + 8px);
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 248, 236, 0.9)),
          linear-gradient(135deg, rgba(214, 90, 49, 0.06), rgba(31, 122, 92, 0.04));
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "CONTROL ROOM";
        position: absolute;
        right: 18px;
        bottom: 10px;
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
        font-size: clamp(2.8rem, 9vw, 7.2rem);
        letter-spacing: 0.2em;
        color: rgba(31, 36, 33, 0.05);
        pointer-events: none;
      }

      .hero-top {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 24px;
      }

      .eyebrow,
      .section-tag {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 0.78rem;
        color: var(--muted);
      }

      .eyebrow::before,
      .section-tag::before {
        content: "";
        width: 28px;
        height: 1px;
        background: currentColor;
      }

      .hero-title {
        margin: 12px 0 8px;
        max-width: 10ch;
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
        font-size: clamp(2.9rem, 8vw, 6.2rem);
        line-height: 0.92;
        letter-spacing: -0.05em;
        text-transform: uppercase;
      }

      .hero-copy {
        margin: 0;
        max-width: 54ch;
        font-size: 1.02rem;
        line-height: 1.7;
        color: var(--muted);
      }

      .hero-badge {
        min-width: 220px;
        padding: 18px;
        border-radius: 22px;
        border: 1px solid rgba(31, 36, 33, 0.08);
        background: rgba(255, 255, 255, 0.55);
        backdrop-filter: blur(12px);
      }

      .hero-badge-label {
        margin: 0 0 6px;
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: 0.74rem;
        color: var(--muted);
      }

      .hero-badge-value {
        margin: 0;
        font-size: 2rem;
        line-height: 1;
      }

      .hero-badge-hint {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .stats-grid,
      .content-grid {
        display: grid;
        gap: 18px;
      }

      .stats-grid {
        margin-top: 22px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .content-grid {
        margin-top: 22px;
        grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
        align-items: start;
      }

      .panel,
      .stat-card,
      .run-card,
      .product-row {
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }

      .stat-card {
        padding: 18px 20px;
        transform: translateY(14px);
        opacity: 0;
        animation: rise 520ms ease forwards;
      }

      .stat-card:nth-child(2) { animation-delay: 60ms; }
      .stat-card:nth-child(3) { animation-delay: 120ms; }
      .stat-card:nth-child(4) { animation-delay: 180ms; }

      .stat-label {
        margin: 0 0 10px;
        color: var(--muted);
        font-size: 0.84rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .stat-value {
        margin: 0;
        font-size: clamp(2rem, 3vw, 2.8rem);
        line-height: 1;
      }

      .stat-detail {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .panel {
        padding: 22px;
      }

      .panel-header,
      .toolbar,
      .form-row,
      .run-meta,
      .run-actions,
      .product-head,
      .product-actions,
      .empty-state {
        display: flex;
        gap: 12px;
      }

      .panel-header,
      .product-head {
        align-items: end;
        justify-content: space-between;
        margin-bottom: 18px;
      }

      .panel-title,
      .section-title {
        margin: 10px 0 0;
        font-family: "Avenir Next Condensed", "Franklin Gothic Medium", "Arial Narrow", sans-serif;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        line-height: 0.98;
        letter-spacing: -0.04em;
        text-transform: uppercase;
      }

      .panel-copy {
        margin: 6px 0 0;
        color: var(--muted);
        max-width: 54ch;
      }

      .toolbar {
        align-items: center;
        flex-wrap: wrap;
      }

      .stack {
        display: grid;
        gap: 14px;
      }

      label {
        display: grid;
        gap: 8px;
        color: var(--muted);
        font-size: 0.88rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      input,
      select,
      textarea {
        width: 100%;
        padding: 13px 14px;
        border: 1px solid rgba(31, 36, 33, 0.12);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        color: var(--ink);
        font: inherit;
      }

      input:focus,
      select:focus,
      textarea:focus {
        outline: 2px solid rgba(214, 90, 49, 0.18);
        border-color: rgba(214, 90, 49, 0.55);
      }

      .form-row {
        align-items: end;
      }

      .form-row > * {
        flex: 1 1 0;
      }

      .form-row .compact {
        flex: 0 0 150px;
      }

      .checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 48px;
        padding: 0 2px;
        text-transform: none;
        letter-spacing: 0;
      }

      .checkbox input {
        width: 18px;
        height: 18px;
        padding: 0;
      }

      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: var(--ink);
        color: #f8f3ea;
        font: inherit;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background 140ms ease;
      }

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        opacity: 0.56;
        cursor: wait;
        transform: none;
      }

      .button-accent {
        background: linear-gradient(135deg, var(--accent), #bf4724);
      }

      .button-soft {
        background: rgba(31, 36, 33, 0.08);
        color: var(--ink);
      }

      .button-ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid rgba(31, 36, 33, 0.12);
      }

      .status-line {
        min-height: 24px;
        margin: 0;
        color: var(--muted);
      }

      .status-line[data-tone="error"] {
        color: #9d2f12;
      }

      .run-list,
      .product-list {
        display: grid;
        gap: 14px;
      }

      .run-card {
        padding: 18px;
        background: var(--panel-strong);
      }

      .run-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
      }

      .run-title,
      .product-name {
        margin: 0;
        font-size: 1.28rem;
        line-height: 1.1;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(31, 36, 33, 0.08);
        color: var(--ink);
        font-size: 0.8rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .pill.success {
        background: rgba(31, 122, 92, 0.12);
        color: var(--accent-alt);
      }

      .pill.failed {
        background: rgba(157, 47, 18, 0.1);
        color: #9d2f12;
      }

      .run-meta,
      .run-actions,
      .product-actions {
        flex-wrap: wrap;
        align-items: center;
      }

      .run-meta {
        margin-top: 12px;
        color: var(--muted);
        font-size: 0.92rem;
      }

      .run-note {
        margin: 12px 0 0;
        color: var(--muted);
      }

      .run-items {
        margin-top: 14px;
        border-top: 1px solid rgba(31, 36, 33, 0.08);
        padding-top: 14px;
        display: grid;
        gap: 10px;
      }

      .item-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.68);
      }

      .item-row a {
        color: inherit;
        text-decoration: none;
      }

      .item-row a:hover {
        color: var(--accent);
      }

      .item-price {
        font-weight: 700;
        white-space: nowrap;
      }

      .product-row {
        padding: 16px;
        background: rgba(255, 249, 240, 0.9);
      }

      .product-head {
        margin-bottom: 10px;
      }

      .product-meta {
        margin: 8px 0 0;
        color: var(--muted);
      }

      .product-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 12px;
      }

      .metric {
        padding: 12px;
        border-radius: 16px;
        background: rgba(31, 36, 33, 0.05);
      }

      .metric-label {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .metric-value {
        margin: 0;
        font-size: 1rem;
      }

      .empty-state {
        align-items: center;
        justify-content: center;
        padding: 30px 18px;
        border: 1px dashed rgba(31, 36, 33, 0.16);
        border-radius: calc(var(--radius) - 6px);
        color: var(--muted);
        text-align: center;
        background: rgba(255, 255, 255, 0.36);
      }

      .footer-note {
        margin-top: 18px;
        color: var(--muted);
        font-size: 0.88rem;
      }

      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(14px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 1024px) {
        .stats-grid,
        .content-grid,
        .product-grid {
          grid-template-columns: 1fr;
        }

        .hero-top,
        .panel-header,
        .product-head,
        .form-row {
          flex-direction: column;
          align-items: stretch;
        }

        .hero-title {
          max-width: none;
        }
      }

      @media (max-width: 640px) {
        .shell {
          width: min(100% - 20px, 1400px);
          margin-top: 10px;
        }

        .hero,
        .panel,
        .run-card,
        .product-row,
        .stat-card {
          padding: 16px;
          border-radius: 20px;
        }

        .run-head,
        .item-row {
          grid-template-columns: 1fr;
        }

        button {
          width: 100%;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="hero-top">
          <div>
            <span class="eyebrow">Dr. Stone Inventory Desk</span>
            <h1 class="hero-title">Scrape history and product registry</h1>
            <p class="hero-copy">
              Browse every collection run for a specific UTC date, inspect captured offers,
              and manage the tracked products that feed the scraper without leaving this page.
            </p>
          </div>
          <aside class="hero-badge">
            <p class="hero-badge-label">Selected UTC day</p>
            <p class="hero-badge-value" id="badge-date">-</p>
            <p class="hero-badge-hint">Runs are filtered by the search start timestamp.</p>
          </aside>
        </div>

        <section class="stats-grid" id="stats-grid">
          <article class="stat-card">
            <p class="stat-label">Runs</p>
            <p class="stat-value" id="stat-runs">0</p>
            <p class="stat-detail">Scrapes found for the selected day</p>
          </article>
          <article class="stat-card">
            <p class="stat-label">Succeeded</p>
            <p class="stat-value" id="stat-success">0</p>
            <p class="stat-detail">Completed without scrape failure</p>
          </article>
          <article class="stat-card">
            <p class="stat-label">Tracked</p>
            <p class="stat-value" id="stat-products">0</p>
            <p class="stat-detail">Products registered in the database</p>
          </article>
          <article class="stat-card">
            <p class="stat-label">Active</p>
            <p class="stat-value" id="stat-active">0</p>
            <p class="stat-detail">Products eligible for scheduled collection</p>
          </article>
        </section>
      </section>

      <section class="content-grid">
        <section class="panel">
          <header class="panel-header">
            <div>
              <span class="section-tag">Scrape ledger</span>
              <h2 class="panel-title">Runs by date</h2>
              <p class="panel-copy">
                Pick a UTC day to review every recorded search run, their outcome, and the captured offers.
              </p>
            </div>
            <div class="toolbar">
              <label>
                Date
                <input type="date" id="date-filter" />
              </label>
              <button class="button-accent" id="refresh-runs" type="button">Refresh runs</button>
            </div>
          </header>

          <p class="status-line" id="runs-status"></p>
          <div class="run-list" id="run-list"></div>
        </section>

        <section class="panel">
          <header class="panel-header">
            <div>
              <span class="section-tag">Catalog registry</span>
              <h2 class="panel-title">Tracked products CRUD</h2>
              <p class="panel-copy">
                Create, update, remove, or collect products manually. The form switches to edit mode when needed.
              </p>
            </div>
          </header>

          <form class="stack" id="product-form">
            <div class="form-row">
              <label>
                Product title
                <input id="field-title" name="title" required placeholder="Radeon RX 9070 XT" />
              </label>
              <label>
                Search term
                <input id="field-search-term" name="search_term" required placeholder="RX 9070 XT" />
              </label>
            </div>

            <div class="form-row">
              <label class="compact">
                Source
                <select id="field-source" name="source">
                  <option value="kabum">KaBuM</option>
                </select>
              </label>
              <label class="compact">
                Scrapes / day
                <input id="field-scrapes" name="scrapes_per_day" type="number" min="1" step="1" value="4" required />
              </label>
              <label class="checkbox compact">
                <input id="field-active" name="active" type="checkbox" checked />
                Active
              </label>
            </div>

            <div class="toolbar">
              <button class="button-accent" id="save-product" type="submit">Create product</button>
              <button class="button-soft" id="cancel-edit" type="button" hidden>Cancel edit</button>
              <button class="button-ghost" id="refresh-products" type="button">Refresh catalog</button>
            </div>
            <p class="status-line" id="products-status"></p>
          </form>

          <div class="product-list" id="product-list"></div>
          <p class="footer-note">Deleting a product also removes its runs and captured items because of database cascade rules.</p>
        </section>
      </section>
    </main>

    <script>
      const state = {
        selectedDate: new Date().toISOString().slice(0, 10),
        runs: [],
        products: [],
        editingId: null,
      };

      const el = {
        badgeDate: document.getElementById("badge-date"),
        dateFilter: document.getElementById("date-filter"),
        runList: document.getElementById("run-list"),
        runsStatus: document.getElementById("runs-status"),
        productList: document.getElementById("product-list"),
        productsStatus: document.getElementById("products-status"),
        form: document.getElementById("product-form"),
        title: document.getElementById("field-title"),
        searchTerm: document.getElementById("field-search-term"),
        source: document.getElementById("field-source"),
        scrapes: document.getElementById("field-scrapes"),
        active: document.getElementById("field-active"),
        saveProduct: document.getElementById("save-product"),
        cancelEdit: document.getElementById("cancel-edit"),
        statRuns: document.getElementById("stat-runs"),
        statSuccess: document.getElementById("stat-success"),
        statProducts: document.getElementById("stat-products"),
        statActive: document.getElementById("stat-active"),
      };

      document.getElementById("refresh-runs").addEventListener("click", () => loadRuns());
      document.getElementById("refresh-products").addEventListener("click", () => loadProducts());
      el.dateFilter.addEventListener("change", () => {
        state.selectedDate = el.dateFilter.value || state.selectedDate;
        renderHeaderDate();
        loadRuns();
      });
      el.form.addEventListener("submit", onSubmitProduct);
      el.cancelEdit.addEventListener("click", resetForm);

      renderHeaderDate();
      el.dateFilter.value = state.selectedDate;
      loadProducts();
      loadRuns();

      function renderHeaderDate() {
        el.badgeDate.textContent = state.selectedDate;
      }

      function setStatus(target, message, tone) {
        target.textContent = message || "";
        target.dataset.tone = tone || "";
      }

      async function api(path, options) {
        const response = await fetch(path, {
          headers: { "content-type": "application/json", ...(options && options.headers ? options.headers : {}) },
          ...options,
        });
        if (response.status === 204) {
          return null;
        }
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data && data.error ? data.error : "Request failed");
        }
        return data;
      }

      async function loadRuns() {
        setStatus(el.runsStatus, "Loading runs...");
        try {
          const data = await api(`/search-runs?date=${encodeURIComponent(state.selectedDate)}&limit=40`);
          state.runs = data.runs || [];
          renderRuns();
          updateStats();
          setStatus(el.runsStatus, state.runs.length ? `${state.runs.length} run(s) loaded.` : "No runs found for this UTC date.");
        } catch (error) {
          state.runs = [];
          renderRuns();
          updateStats();
          setStatus(el.runsStatus, error.message, "error");
        }
      }

      async function loadProducts() {
        setStatus(el.productsStatus, "Loading catalog...");
        try {
          state.products = await api("/tracked-products?all=1");
          renderProducts();
          updateStats();
          setStatus(el.productsStatus, `${state.products.length} product(s) loaded.`);
        } catch (error) {
          state.products = [];
          renderProducts();
          updateStats();
          setStatus(el.productsStatus, error.message, "error");
        }
      }

      function updateStats() {
        const successCount = state.runs.filter((run) => run.status === "succeeded").length;
        const activeCount = state.products.filter((product) => Boolean(product.active)).length;
        el.statRuns.textContent = String(state.runs.length);
        el.statSuccess.textContent = String(successCount);
        el.statProducts.textContent = String(state.products.length);
        el.statActive.textContent = String(activeCount);
      }

      function renderRuns() {
        if (!state.runs.length) {
          el.runList.innerHTML = '<div class="empty-state">No scrape runs were registered for this UTC date yet.</div>';
          return;
        }

        el.runList.innerHTML = state.runs.map((run) => {
          const pillClass = run.status === "succeeded" ? "pill success" : run.status === "failed" ? "pill failed" : "pill";
          const itemsMarkup = Array.isArray(run.items) && run.items.length
            ? `<div class="run-items">${run.items.map((item) => `
                <article class="item-row">
                  <div>
                    <a href="${escapeHtml(item.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(item.product_title)}</a>
                    <div class="product-meta">${escapeHtml(item.seller_name || "Unknown seller")} · ${escapeHtml(item.availability || "unknown")}</div>
                  </div>
                  <div class="item-price">${escapeHtml(formatMoney(item.price_value, item.currency))}</div>
                </article>
              `).join("")}</div>`
            : '<div class="empty-state">This run finished without stored matching items.</div>';
          return `
            <article class="run-card">
              <div class="run-head">
                <div>
                  <h3 class="run-title">${escapeHtml(run.tracked_product_title || run.search_term)}</h3>
                  <p class="product-meta">${escapeHtml(run.search_term)} · ${escapeHtml(run.source_name || "unknown source")}</p>
                </div>
                <span class="${pillClass}">${escapeHtml(run.status)}</span>
              </div>
              <div class="run-meta">
                <span>Started ${escapeHtml(formatDateTime(run.started_at))}</span>
                <span>${escapeHtml(run.matched_results || 0)} match(es)</span>
                <span>${escapeHtml(run.total_results || 0)} raw result(s)</span>
                <span>${escapeHtml(run.page_count || 0)} page(s)</span>
              </div>
              ${run.message ? `<p class="run-note">${escapeHtml(run.message)}</p>` : ""}
              ${itemsMarkup}
            </article>
          `;
        }).join("");
      }

      function renderProducts() {
        if (!state.products.length) {
          el.productList.innerHTML = '<div class="empty-state">No tracked products are registered yet.</div>';
          return;
        }

        el.productList.innerHTML = state.products.map((product) => `
          <article class="product-row">
            <div class="product-head">
              <div>
                <h3 class="product-name">${escapeHtml(product.product_title)}</h3>
                <p class="product-meta">${escapeHtml(product.search_term)} · ${escapeHtml(product.source_name)} · created ${escapeHtml(formatDateTime(product.created_at))}</p>
              </div>
              <span class="pill ${product.active ? "success" : ""}">${product.active ? "active" : "inactive"}</span>
            </div>
            <div class="product-grid">
              <div class="metric">
                <p class="metric-label">Scrapes / day</p>
                <p class="metric-value">${escapeHtml(product.scrapes_per_day)}</p>
              </div>
              <div class="metric">
                <p class="metric-label">Source</p>
                <p class="metric-value">${escapeHtml(product.source_name)}</p>
              </div>
              <div class="metric">
                <p class="metric-label">Updated</p>
                <p class="metric-value">${escapeHtml(formatDateTime(product.updated_at))}</p>
              </div>
            </div>
            <div class="product-actions" style="margin-top: 14px;">
              <button class="button-soft" type="button" data-action="edit" data-id="${escapeHtml(product.id)}">Edit</button>
              <button class="button-ghost" type="button" data-action="collect" data-id="${escapeHtml(product.id)}">Collect now</button>
              <button class="button-ghost" type="button" data-action="delete" data-id="${escapeHtml(product.id)}">Delete</button>
            </div>
          </article>
        `).join("");

        el.productList.querySelectorAll("button[data-action]").forEach((button) => {
          button.addEventListener("click", () => onProductAction(button.dataset.action, button.dataset.id));
        });
      }

      function resetForm() {
        state.editingId = null;
        el.form.reset();
        el.source.value = "kabum";
        el.scrapes.value = "4";
        el.active.checked = true;
        el.saveProduct.textContent = "Create product";
        el.cancelEdit.hidden = true;
        setStatus(el.productsStatus, "Create mode ready.");
      }

      async function onSubmitProduct(event) {
        event.preventDefault();
        const wasEditing = Boolean(state.editingId);
        const payload = {
          title: el.title.value.trim(),
          search_term: el.searchTerm.value.trim(),
          source: el.source.value,
          scrapes_per_day: Number(el.scrapes.value),
          active: el.active.checked,
        };
        const method = state.editingId ? "PUT" : "POST";
        const endpoint = state.editingId ? `/tracked-products/${state.editingId}` : "/tracked-products";

        el.saveProduct.disabled = true;
        setStatus(el.productsStatus, wasEditing ? "Saving product..." : "Creating product...");
        try {
          await api(endpoint, { method, body: JSON.stringify(payload) });
          await loadProducts();
          resetForm();
          setStatus(el.productsStatus, wasEditing ? "Product updated." : "Product created.");
        } catch (error) {
          setStatus(el.productsStatus, error.message, "error");
        } finally {
          el.saveProduct.disabled = false;
        }
      }

      async function onProductAction(action, id) {
        const product = state.products.find((entry) => entry.id === id);
        if (!product) {
          return;
        }

        if (action === "edit") {
          state.editingId = product.id;
          el.title.value = product.product_title || "";
          el.searchTerm.value = product.search_term || "";
          el.source.value = product.source_name || "kabum";
          el.scrapes.value = String(product.scrapes_per_day || 4);
          el.active.checked = Boolean(product.active);
          el.saveProduct.textContent = "Save changes";
          el.cancelEdit.hidden = false;
          setStatus(el.productsStatus, `Editing ${product.product_title}.`);
          el.form.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        if (action === "collect") {
          setStatus(el.productsStatus, `Collecting ${product.product_title}...`);
          try {
            await api(`/tracked-products/${id}?action=collect`, { method: "POST" });
            await Promise.all([loadProducts(), loadRuns()]);
            setStatus(el.productsStatus, `Manual collection started and stored for ${product.product_title}.`);
          } catch (error) {
            setStatus(el.productsStatus, error.message, "error");
          }
          return;
        }

        if (action === "delete") {
          if (!window.confirm(`Delete ${product.product_title}? This also removes run history.`)) {
            return;
          }
          setStatus(el.productsStatus, `Deleting ${product.product_title}...`);
          try {
            await api(`/tracked-products/${id}`, { method: "DELETE" });
            if (state.editingId === id) {
              resetForm();
            }
            await Promise.all([loadProducts(), loadRuns()]);
            setStatus(el.productsStatus, `Deleted ${product.product_title}.`);
          } catch (error) {
            setStatus(el.productsStatus, error.message, "error");
          }
        }
      }

      function formatDateTime(value) {
        if (!value) {
          return "unknown time";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return value;
        }
        return new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(date);
      }

      function formatMoney(value, currency) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          return `${value} ${currency || ""}`.trim();
        }
        try {
          return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "BRL" }).format(numeric);
        } catch {
          return `${numeric.toFixed(2)} ${currency || ""}`.trim();
        }
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }
    </script>
  </body>
</html>
"""
