import { describe, expect, test, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../dr-stone-api/src/app.js";
import type { SearchResultItem } from "../dr-stone-database/src/index.js";
import { createTestDatabaseServices, withTemporaryDatabase } from "./helpers/postgres.js";

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type TestDatabase = Awaited<ReturnType<typeof createTestDatabaseServices>>;

async function createTestApp(databaseUrl: string, enabledSources: string[] = []): Promise<FastifyInstance> {
  return createApp({
    host: "127.0.0.1",
    port: 8080,
    scrapper: {
      databaseUrl,
      timeoutSeconds: 1,
      maxRetries: 0,
      retryBackoffSeconds: 0,
      requestDelaySeconds: 0,
      proxyServer: "http://127.0.0.1:3128",
      proxyUsername: "proxyuser",
      proxyPassword: "proxy-password",
      proxyDisabledSources: [],
      logLevel: "silent",
      userAgent: "test",
      intervalSeconds: 43200,
      enabledSources,
      blockHeavyResources: true
    }
  });
}

async function persistSearchItem(input: {
  database: TestDatabase;
  trackedProductId: string;
  sourceName: "kabum" | "amazon" | "pichau" | "mercadolivre";
  capturedAt: string;
  price: string;
  productKey: string;
  productTitle?: string;
  sellerName?: string;
}) {
  const sourceConfig =
    input.sourceName === "kabum"
      ? {
          searchUrl: "https://www.kabum.com.br/busca/rx-9070-xt",
          sellerName: input.sellerName ?? "KaBuM!",
          canonicalUrl: `https://www.kabum.com.br/produto/${input.productKey}/rx-9070-xt`
        }
      : input.sourceName === "amazon"
        ? {
            searchUrl: "https://www.amazon.com.br/s?k=rx+9070+xt",
            sellerName: input.sellerName ?? "Amazon",
            canonicalUrl: `https://www.amazon.com.br/dp/${input.productKey}`
          }
        : input.sourceName === "pichau"
          ? {
              searchUrl: "https://www.pichau.com.br/search?q=rx%209070%20xt",
              sellerName: input.sellerName ?? "Pichau",
              canonicalUrl: `https://www.pichau.com.br/${input.productKey}`
            }
          : {
              searchUrl: "https://lista.mercadolivre.com.br/rx-9070-xt",
              sellerName: input.sellerName ?? "Mercado Livre",
              canonicalUrl: `https://www.mercadolivre.com.br/p/${input.productKey}`
          };

  const searchRunId = await input.database.searchRuns.create({
    trackedProductId: input.trackedProductId,
    sourceName: input.sourceName,
    searchTerm: "RX 9070 XT",
    searchUrl: sourceConfig.searchUrl
  });

  const inserted = await input.database.searchRuns.persistItems({
    searchRunId,
    trackedProductId: input.trackedProductId,
    items: [
      {
        source: input.sourceName,
        title: input.productTitle ?? `Placa RX 9070 XT ${input.productKey}`,
        canonicalUrl: sourceConfig.canonicalUrl,
        price: input.price,
        currency: "BRL",
        availability: "in_stock",
        isAvailable: true,
        position: 1,
        metadata: {
          source_product_key: input.productKey,
          seller_name: sourceConfig.sellerName
        }
      } satisfies SearchResultItem
    ],
    capturedAt: input.capturedAt
  });

  await input.database.searchRuns.finish(searchRunId, {
    status: "succeeded",
    totalResults: 10,
    matchedResults: inserted,
    pageCount: 1,
    message: "lowest_prices_saved"
  });
}

describe("api manual collection queue", () => {
  test("enqueues one job per source for the tracked product", async () => {
    const trackedProduct = {
      id: "tracked-1",
      productTitle: "RX 9070 XT",
      searchTerms: ["RX 9070 XT"],
      active: true,
      createdAt: "2026-03-19T00:00:00.000Z",
      updatedAt: "2026-03-19T00:00:00.000Z"
    };
    const enqueueTrackedProductsForSources = vi.fn(async () => ({
      scheduledCount: 4,
      skippedCount: 0
    }));
    const stop = vi.fn(async () => {});
    const closeDatabase = vi.fn(async () => {});
    const app = await createApp(
      {
        host: "127.0.0.1",
        port: 8080,
        scrapper: {
          databaseUrl: "postgresql://test",
          timeoutSeconds: 1,
          maxRetries: 0,
          retryBackoffSeconds: 0,
          requestDelaySeconds: 0,
          proxyServer: "http://127.0.0.1:3128",
          proxyUsername: "proxyuser",
          proxyPassword: "proxy-password",
          proxyDisabledSources: [],
          logLevel: "silent",
          userAgent: "test",
          intervalSeconds: 43200,
          enabledSources: ["kabum", "amazon", "pichau", "mercadolivre"],
          blockHeavyResources: true
        }
      },
      {
        runtime: {
          logger: {
            info: () => {},
            warn: () => {},
            error: () => {}
          },
          database: {
            close: closeDatabase,
            trackedProducts: {
              getById: async () => trackedProduct
            }
          },
          collectionJobScheduler: {
            stop,
            enqueueTrackedProductsForSources
          },
          sources: []
        } as never
      }
    );

    try {
      const response = await app.inject({
        method: "POST",
        url: `/tracked-products/${trackedProduct.id}?action=collect`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        tracked_product_id: trackedProduct.id,
        enqueued_jobs: 4,
        skipped_jobs: 0
      });
      expect(enqueueTrackedProductsForSources).toHaveBeenCalledWith(
        [trackedProduct],
        undefined,
        { force: true }
      );
    } finally {
      await app.close();
    }

    expect(stop).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});

describeWithDatabase("api", () => {
  test("serves root, health, and tracked product CRUD", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createTestApp(databaseUrl);

      try {
        const rootResponse = await app.inject({ method: "GET", url: "/" });
        const healthResponse = await app.inject({ method: "GET", url: "/health" });
        expect(rootResponse.statusCode).toBe(200);
        expect(rootResponse.json()).toEqual({ name: "dr-stone-api", status: "ok" });
        expect(healthResponse.json()).toEqual({ status: "ok" });

        const createResponse = await app.inject({
          method: "POST",
          url: "/tracked-products",
          payload: {
            title: "RX 9070 XT",
            search_terms: ["RX 9070 XT", "Sapphire"]
          }
        });

        expect(createResponse.statusCode).toBe(201);
        expect(createResponse.json()).toMatchObject({
          title: "RX 9070 XT",
          search_terms: ["RX 9070 XT", "Sapphire"],
          active: true
        });

        const trackedProductId = createResponse.json().id as string;
        const listResponse = await app.inject({ method: "GET", url: "/tracked-products" });
        const detailResponse = await app.inject({
          method: "GET",
          url: `/tracked-products/${trackedProductId}`
        });
        const deleteResponse = await app.inject({
          method: "DELETE",
          url: `/tracked-products/${trackedProductId}`
        });
        const missingResponse = await app.inject({
          method: "GET",
          url: `/tracked-products/${trackedProductId}`
        });

        expect(listResponse.statusCode).toBe(200);
        expect(listResponse.json()).toHaveLength(1);
        expect(detailResponse.json()).toMatchObject({
          id: trackedProductId,
          title: "RX 9070 XT",
          search_terms: ["RX 9070 XT", "Sapphire"]
        });
        expect(deleteResponse.statusCode).toBe(204);
        expect(missingResponse.statusCode).toBe(404);
      } finally {
        await app.close();
      }
    });
  });

  test("serves OpenAPI JSON and Swagger UI", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createTestApp(databaseUrl);

      try {
        const openApiResponse = await app.inject({ method: "GET", url: "/openapi.json" });
        const docsResponse = await app.inject({ method: "GET", url: "/docs" });

        expect(openApiResponse.statusCode).toBe(200);
        expect(openApiResponse.headers["content-type"]).toContain("application/json");
        expect(openApiResponse.json()).toMatchObject({
          openapi: "3.0.3",
          info: {
            title: "Dr. Stone API"
          }
        });
        expect(openApiResponse.json().paths).toMatchObject({
          "/tracked-products": expect.any(Object),
          "/sources": expect.any(Object),
          "/price-history/minimums": expect.any(Object),
          "/search-runs": expect.any(Object)
        });

        expect(docsResponse.statusCode).toBe(200);
        expect(docsResponse.headers["content-type"]).toContain("text/html");
        expect(docsResponse.body).toContain("Swagger UI");
      } finally {
        await app.close();
      }
    });
  });

  test("handles CORS preflight and restricts origins", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createTestApp(databaseUrl);

      try {
        const localhostPreflight = await app.inject({
          method: "OPTIONS",
          url: "/tracked-products",
          headers: {
            origin: "http://localhost:3000",
            "access-control-request-headers": "content-type"
          }
        });
        const domainResponse = await app.inject({
          method: "GET",
          url: "/health",
          headers: {
            origin: "https://drstone.leogendaryo.com"
          }
        });
        const deniedPreflight = await app.inject({
          method: "OPTIONS",
          url: "/tracked-products",
          headers: {
            origin: "https://evil.example.com",
            "access-control-request-headers": "content-type"
          }
        });

        expect(localhostPreflight.statusCode).toBe(204);
        expect(localhostPreflight.headers["access-control-allow-origin"]).toBe(
          "http://localhost:3000"
        );
        expect(localhostPreflight.headers["access-control-allow-methods"]).toContain("OPTIONS");

        expect(domainResponse.statusCode).toBe(200);
        expect(domainResponse.headers["access-control-allow-origin"]).toBe(
          "https://drstone.leogendaryo.com"
        );

        expect(deniedPreflight.statusCode).toBe(403);
        expect(deniedPreflight.json()).toEqual({ error: "Origin not allowed" });
        expect(deniedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
      } finally {
        await app.close();
      }
    });
  });

  test("lists canonical sources with labels and active state", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createTestApp(databaseUrl, ["kabum", "pichau"]);

      try {
        const response = await app.inject({ method: "GET", url: "/sources" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          sources: [
            {
              source_name: "kabum",
              source_label: "KaBuM!",
              active: true
            },
            {
              source_name: "amazon",
              source_label: "Amazon",
              active: false
            },
            {
              source_name: "pichau",
              source_label: "Pichau",
              active: true
            },
            {
              source_name: "mercadolivre",
              source_label: "Mercado Livre",
              active: false
            }
          ]
        });
      } finally {
        await app.close();
      }
    });
  });

  test("filters tracked product history by source after applying the source filter", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const database = await createTestDatabaseServices(databaseUrl);
      const app = await createTestApp(databaseUrl, ["kabum", "amazon", "pichau"]);

      try {
        const trackedProduct = await database.trackedProducts.create({
          productTitle: "RX 9070 XT",
          searchTerms: ["RX 9070 XT"]
        });

        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "kabum",
          capturedAt: "2026-03-02T08:00:00+00:00",
          price: "6100.00",
          productKey: "1"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "amazon",
          capturedAt: "2026-03-03T11:00:00+00:00",
          price: "6000.00",
          productKey: "B001"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "kabum",
          capturedAt: "2026-03-04T12:00:00+00:00",
          price: "5800.00",
          productKey: "2"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "pichau",
          capturedAt: "2026-03-05T13:00:00+00:00",
          price: "5700.00",
          productKey: "placa-de-video-sapphire-radeon-rx-9070-xt-pulse-16gb-gddr6-256-bit"
        });

        const allSourcesResponse = await app.inject({
          method: "GET",
          url: `/tracked-products/${trackedProduct.id}/history`,
          query: {
            source: "all",
            limit: "2"
          }
        });
        const kabumResponse = await app.inject({
          method: "GET",
          url: `/tracked-products/${trackedProduct.id}/history`,
          query: {
            source: "kabum",
            limit: "10"
          }
        });

        expect(allSourcesResponse.statusCode).toBe(200);
        expect(allSourcesResponse.json()).toMatchObject({
          product_id: trackedProduct.id,
          product_title: "RX 9070 XT",
          source_filter: "all",
          limit: 2,
          offset: 0,
          has_more: true,
          next_offset: 2
        });
        expect(
          allSourcesResponse.json().items.map((item: { source_name: string; price: string }) => [
            item.source_name,
            item.price
          ])
        ).toEqual([
          ["pichau", "5700.00"],
          ["kabum", "5800.00"]
        ]);
        expect(allSourcesResponse.json().items[0]).toMatchObject({
          source_name: "pichau",
          source_label: "Pichau"
        });

        expect(kabumResponse.statusCode).toBe(200);
        expect(kabumResponse.json()).toMatchObject({
          product_id: trackedProduct.id,
          source_filter: "kabum",
          has_more: false,
          next_offset: null
        });
        expect(
          kabumResponse.json().items.map((item: { source_name: string; price: string }) => [
            item.source_name,
            item.price
          ])
        ).toEqual([
          ["kabum", "5800.00"],
          ["kabum", "6100.00"]
        ]);
      } finally {
        await app.close();
        await database.close();
      }
    });
  });

  test("returns one minimum-price series per source and supports specific-source filtering", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const database = await createTestDatabaseServices(databaseUrl);
      const app = await createTestApp(databaseUrl, ["kabum", "amazon", "pichau"]);

      try {
        const trackedProduct = await database.trackedProducts.create({
          productTitle: "RX 9070 XT",
          searchTerms: ["RX 9070 XT"]
        });

        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "kabum",
          capturedAt: "2026-03-02T08:00:00+00:00",
          price: "6100.00",
          productKey: "1"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "kabum",
          capturedAt: "2026-03-02T15:00:00+00:00",
          price: "5900.00",
          productKey: "2"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "amazon",
          capturedAt: "2026-03-03T11:00:00+00:00",
          price: "6000.00",
          productKey: "B001"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "amazon",
          capturedAt: "2026-03-04T09:00:00+00:00",
          price: "5850.00",
          productKey: "B002"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "kabum",
          capturedAt: "2026-03-10T09:30:00+00:00",
          price: "5700.00",
          productKey: "3"
        });
        await persistSearchItem({
          database,
          trackedProductId: trackedProduct.id,
          sourceName: "pichau",
          capturedAt: "2026-03-03T08:30:00+00:00",
          price: "5800.00",
          productKey: "placa-de-video-sapphire-radeon-rx-9070-xt-pulse-16gb-gddr6-256-bit"
        });

        const allSourcesResponse = await app.inject({
          method: "GET",
          url: "/price-history/minimums",
          query: {
            product_id: trackedProduct.id,
            granularity: "week",
            start_at: "2026-03-01",
            end_at: "2026-03-31",
            source: "all"
          }
        });
        const amazonResponse = await app.inject({
          method: "GET",
          url: "/price-history/minimums",
          query: {
            product_id: trackedProduct.id,
            period: "week",
            start_at: "2026-03-01",
            end_at: "2026-03-31",
            source: "amazon"
          }
        });
        const emptyAmazonResponse = await app.inject({
          method: "GET",
          url: "/price-history/minimums",
          query: {
            product_id: trackedProduct.id,
            granularity: "week",
            start_at: "2026-03-10",
            end_at: "2026-03-31",
            source: "amazon"
          }
        });

        expect(allSourcesResponse.statusCode).toBe(200);
        expect(allSourcesResponse.json()).toMatchObject({
          product_id: trackedProduct.id,
          product_title: "RX 9070 XT",
          granularity: "week",
          period: "week",
          source_filter: "all"
        });
        expect(
          allSourcesResponse.json().series.map(
            (series: {
              source_name: string;
              items: Array<{ period_start: string; price: string }>;
            }) => [
              series.source_name,
              series.items.map((item) => [item.period_start, item.price])
            ]
          )
        ).toEqual([
          [
            "kabum",
            [
              ["2026-03-02T00:00:00+00:00", "5900.00"],
              ["2026-03-09T00:00:00+00:00", "5700.00"]
            ]
          ],
          [
            "amazon",
            [["2026-03-02T00:00:00+00:00", "5850.00"]]
          ],
          [
            "pichau",
            [["2026-03-02T00:00:00+00:00", "5800.00"]]
          ]
        ]);
        expect(
          allSourcesResponse.json().items.map((item: { source_name: string; price: string }) => [
            item.source_name,
            item.price
          ])
        ).toEqual([
          ["kabum", "5900.00"],
          ["kabum", "5700.00"],
          ["amazon", "5850.00"],
          ["pichau", "5800.00"]
        ]);
        expect(allSourcesResponse.json().series[0]).toMatchObject({
          source_name: "kabum",
          source_label: "KaBuM!"
        });

        expect(amazonResponse.statusCode).toBe(200);
        expect(amazonResponse.json()).toMatchObject({
          source_filter: "amazon"
        });
        expect(amazonResponse.json().series).toHaveLength(1);
        expect(amazonResponse.json().series[0]).toMatchObject({
          source_name: "amazon",
          source_label: "Amazon"
        });
        expect(
          amazonResponse.json().series[0].items.map((item: { period_start: string; price: string }) => [
            item.period_start,
            item.price
          ])
        ).toEqual([["2026-03-02T00:00:00+00:00", "5850.00"]]);

        expect(emptyAmazonResponse.statusCode).toBe(200);
        expect(emptyAmazonResponse.json()).toMatchObject({
          source_filter: "amazon",
          items: []
        });
        expect(emptyAmazonResponse.json().series).toEqual([
          {
            source_name: "amazon",
            source_label: "Amazon",
            items: []
          }
        ]);
      } finally {
        await app.close();
        await database.close();
      }
    });
  });

  test("rejects invalid source filters with 400", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const database = await createTestDatabaseServices(databaseUrl);
      const app = await createTestApp(databaseUrl, ["kabum", "amazon", "pichau"]);

      try {
        const trackedProduct = await database.trackedProducts.create({
          productTitle: "RX 9070 XT",
          searchTerms: ["RX 9070 XT"]
        });

        const historyResponse = await app.inject({
          method: "GET",
          url: `/tracked-products/${trackedProduct.id}/history`,
          query: {
            source: "terabyteshop"
          }
        });
        const minimumsResponse = await app.inject({
          method: "GET",
          url: "/price-history/minimums",
          query: {
            product_id: trackedProduct.id,
            granularity: "week",
            start_at: "2026-03-01",
            end_at: "2026-03-31",
            source: "terabyteshop"
          }
        });

        expect(historyResponse.statusCode).toBe(400);
        expect(historyResponse.json()).toEqual({
          error: "source must be `all` or a valid source_name."
        });
        expect(minimumsResponse.statusCode).toBe(400);
        expect(minimumsResponse.json()).toEqual({
          error: "source must be `all` or a valid source_name."
        });
      } finally {
        await app.close();
        await database.close();
      }
    });
  });
});
