import { describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";

import { createApp } from "../dr-stone-api/src/app.js";
import type { SearchResultItem } from "../dr-stone-database/src/index.js";
import { createTestDatabaseServices, withTemporaryDatabase } from "./helpers/postgres.js";

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type RuntimeApp = FastifyInstance & {
  drStoneRuntime?: {
    database: {
      close: () => Promise<void>;
    };
  };
};

describeWithDatabase("api", () => {
  test("serves root, health, and tracked product CRUD", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createApp({
        host: "127.0.0.1",
        port: 8080,
        scrapper: {
          databaseUrl,
          timeoutSeconds: 1,
          maxRetries: 0,
          retryBackoffSeconds: 0,
          requestDelaySeconds: 0,
          logLevel: "silent",
          userAgent: "test",
          intervalSeconds: 21600,
          enabledSources: []
        }
      });

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
        await (app as RuntimeApp).drStoneRuntime?.database.close();
      }
    });
  });

  test("serves OpenAPI JSON and Swagger UI", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createApp({
        host: "127.0.0.1",
        port: 8080,
        scrapper: {
          databaseUrl,
          timeoutSeconds: 1,
          maxRetries: 0,
          retryBackoffSeconds: 0,
          requestDelaySeconds: 0,
          logLevel: "silent",
          userAgent: "test",
          intervalSeconds: 21600,
          enabledSources: []
        }
      });

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
          "/price-history/minimums": expect.any(Object),
          "/search-runs": expect.any(Object)
        });

        expect(docsResponse.statusCode).toBe(200);
        expect(docsResponse.headers["content-type"]).toContain("text/html");
        expect(docsResponse.body).toContain("Swagger UI");
      } finally {
        await (app as RuntimeApp).drStoneRuntime?.database.close();
      }
    });
  });

  test("handles CORS preflight and restricts origins", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const app = await createApp({
        host: "127.0.0.1",
        port: 8080,
        scrapper: {
          databaseUrl,
          timeoutSeconds: 1,
          maxRetries: 0,
          retryBackoffSeconds: 0,
          requestDelaySeconds: 0,
          logLevel: "silent",
          userAgent: "test",
          intervalSeconds: 21600,
          enabledSources: []
        }
      });

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
        await (app as RuntimeApp).drStoneRuntime?.database.close();
      }
    });
  });

  test("groups minimum prices by period", async () => {
    await withTemporaryDatabase(async (databaseUrl) => {
      const database = await createTestDatabaseServices(databaseUrl);
      const app = await createApp({
        host: "127.0.0.1",
        port: 8080,
        scrapper: {
          databaseUrl,
          timeoutSeconds: 1,
          maxRetries: 0,
          retryBackoffSeconds: 0,
          requestDelaySeconds: 0,
          logLevel: "silent",
          userAgent: "test",
          intervalSeconds: 21600,
          enabledSources: []
        }
      });

      try {
        const trackedProduct = await database.trackedProducts.create({
          productTitle: "RX 9070 XT",
          searchTerms: ["RX 9070 XT"]
        });

        const persistItem = async (
          capturedAt: string,
          price: string,
          productKey: string
        ) => {
          const searchRunId = await database.searchRuns.create({
            trackedProductId: trackedProduct.id,
            sourceName: "kabum",
            searchTerm: "RX 9070 XT",
            searchUrl: "https://www.kabum.com.br/busca/rx-9070-xt"
          });
          const inserted = await database.searchRuns.persistItems({
            searchRunId,
            trackedProductId: trackedProduct.id,
            items: [
              {
                source: "kabum",
                title: `Placa RX 9070 XT ${productKey}`,
                canonicalUrl: `https://www.kabum.com.br/produto/${productKey}/rx-9070-xt`,
                price,
                currency: "BRL",
                availability: "in_stock",
                isAvailable: true,
                position: 1,
                metadata: {
                  source_product_key: productKey,
                  seller_name: "KaBuM!"
                }
              } satisfies SearchResultItem
            ],
            capturedAt
          });
          await database.searchRuns.finish(searchRunId, {
            status: "succeeded",
            totalResults: 10,
            matchedResults: inserted,
            pageCount: 1,
            message: "lowest_prices_saved"
          });
        };

        await persistItem("2026-03-02T08:00:00+00:00", "6100.00", "1");
        await persistItem("2026-03-02T15:00:00+00:00", "5900.00", "2");
        await persistItem("2026-03-04T12:00:00+00:00", "5800.00", "3");
        await persistItem("2026-03-10T09:30:00+00:00", "5700.00", "4");

        const response = await app.inject({
          method: "GET",
          url: "/price-history/minimums",
          query: {
            product_id: trackedProduct.id,
            period: "week",
            start_at: "2026-03-01",
            end_at: "2026-03-31"
          }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          product_id: trackedProduct.id,
          product_title: "RX 9070 XT",
          granularity: "week",
          period: "week"
        });
        expect(
          response.json().items.map((item: { period_start: string; price: string }) => [
            item.period_start,
            item.price
          ])
        ).toEqual([
          ["2026-03-02T00:00:00+00:00", "5800.00"],
          ["2026-03-09T00:00:00+00:00", "5700.00"]
        ]);
      } finally {
        await (app as RuntimeApp).drStoneRuntime?.database.close();
        await database.close();
      }
    });
  });
});
