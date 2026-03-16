import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, {
  type FastifyInstance,
  type FastifyReply
} from "fastify";
import type { SearchCollectionResult, TrackedProduct } from "@dr-stone/database";
import { normalizeSearchTerms } from "@dr-stone/database";
import { z } from "zod";

import type { ApiSettings } from "./env.js";
import { buildRuntime } from "./services/runtime.js";

const OPENAPI_SPEC_PATH = resolveOpenApiSpecPath();

function resolveOpenApiSpecPath(): string {
  const bundledSpecPath = fileURLToPath(new URL("./openapi.json", import.meta.url));
  if (existsSync(bundledSpecPath)) {
    return bundledSpecPath;
  }

  const sourceSpecPath = fileURLToPath(new URL("../src/openapi.json", import.meta.url));
  if (existsSync(sourceSpecPath)) {
    return sourceSpecPath;
  }

  throw new Error(`${bundledSpecPath} does not exist`);
}

const trackedProductSchema = z.object({
  title: z.string().trim().min(1),
  search_terms: z.array(z.string()).optional(),
  search_term: z.string().optional(),
  active: z.boolean().optional(),
  scrapes_per_day: z.number().optional()
});
const trackedProductPatchSchema = trackedProductSchema.partial();
type TrackedProductPayload = z.infer<typeof trackedProductPatchSchema>;

export async function createApp(settings: ApiSettings): Promise<FastifyInstance> {
  const runtime = await buildRuntime(settings);
  const app = Fastify({ logger: false });
  Reflect.set(app, "drStoneRuntime", runtime);

  await app.register(swagger, {
    mode: "static",
    specification: {
      path: OPENAPI_SPEC_PATH,
      baseDir: fileURLToPath(new URL(".", import.meta.url))
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    },
    staticCSP: true
  });

  app.addHook("onRequest", async (request, reply) => {
    const corsOrigin = resolveCorsOrigin(request.headers.origin);
    if (corsOrigin) {
      setCorsHeaders(reply, corsOrigin, request.headers["access-control-request-headers"]);
    }

    if (request.method === "OPTIONS") {
      if (request.headers.origin && !corsOrigin) {
        await reply.code(403).send({ error: "Origin not allowed" });
        return;
      }

      await reply.code(204).send();
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const corsOrigin = resolveCorsOrigin(request.headers.origin);
    if (corsOrigin) {
      setCorsHeaders(reply, corsOrigin, request.headers["access-control-request-headers"]);
    }

    return payload;
  });

  app.addHook("onClose", async () => {
    await runtime.collectionService.close();
    await runtime.database.close();
  });

  app.get("/openapi.json", async (_request, reply) => {
    reply.type("application/json; charset=utf-8");
    return app.swagger();
  });

  app.get("/", async () => ({ name: "dr-stone-api", status: "ok" }));
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/search-runs", async (request) => {
    const query = request.query as { date?: string; limit?: string };
    if (query.date) {
      validateDate(query.date);
    }

    const limit = parsePositiveInt(query.limit, "limit", { defaultValue: 40, maximum: 200 });
    const runs = await runtime.database.searchRuns.list({
      date: query.date,
      limit
    });
    return { date: query.date ?? null, runs };
  });

  app.get("/tracked-products", async (request) => {
    const query = request.query as { all?: string };
    const products = await runtime.database.trackedProducts.list({
      activeOnly: query.all !== "1"
    });
    return products.map(toTrackedProductResponse);
  });

  app.post("/tracked-products", async (request, reply) => {
    const payload = requireTrackedProductBody(request.body);
    rejectLegacyScrapeRateFields(payload);
    const trackedProduct = await runtime.database.trackedProducts.create({
      productTitle: requireString(payload.title, "title"),
      searchTerms: requireSearchTerms(payload),
      active: payload.active ?? true
    });

    reply.code(201);
    return toTrackedProductResponse(trackedProduct);
  });

  app.post("/collect-due", async () => {
    const results = await runtime.collectionService.collectDue();
    return results.map(toCollectionResultResponse);
  });

  app.get("/tracked-products/:trackedProductId", async (request) => {
    const trackedProductId = (request.params as { trackedProductId: string }).trackedProductId;
    const trackedProduct = await runtime.database.trackedProducts.getById(trackedProductId);
    if (!trackedProduct) {
      throw notFound(`Tracked product not found: ${trackedProductId}`);
    }

    return toTrackedProductResponse(trackedProduct);
  });

  app.route({
    method: ["POST", "PUT", "PATCH", "DELETE"],
    url: "/tracked-products/:trackedProductId",
    handler: async (request, reply) => {
      const trackedProductId = (request.params as { trackedProductId: string }).trackedProductId;

      if (request.method === "POST") {
        const query = request.query as { action?: string };
        if (query.action !== "collect") {
          throw badRequest("Unsupported tracked-product POST action.");
        }

        const trackedProduct = await runtime.database.trackedProducts.getById(trackedProductId);
        if (!trackedProduct || !trackedProduct.active) {
          throw notFound(`Tracked product not found: ${trackedProductId}`);
        }

        return toCollectionResultResponse(
          await runtime.collectionService.collectTrackedProduct(trackedProduct)
        );
      }

      if (request.method === "DELETE") {
        const deleted = await runtime.database.trackedProducts.delete(trackedProductId);
        if (!deleted) {
          throw notFound(`Tracked product not found: ${trackedProductId}`);
        }

        await reply.code(204).send();
        return reply;
      }

      const current = await runtime.database.trackedProducts.getById(trackedProductId);
      if (!current) {
        throw notFound(`Tracked product not found: ${trackedProductId}`);
      }

      const payload = requireTrackedProductBody(request.body);
      rejectLegacyScrapeRateFields(payload);
      const updated = await runtime.database.trackedProducts.update(trackedProductId, {
        productTitle: payload.title?.trim() || current.productTitle,
        searchTerms: coerceSearchTerms(payload) ?? current.searchTerms,
        active: payload.active ?? current.active
      });

      if (!updated) {
        throw notFound(`Tracked product not found: ${trackedProductId}`);
      }

      return toTrackedProductResponse(updated);
    }
  });

  app.get("/tracked-products/:trackedProductId/history", async (request) => {
    const trackedProductId = (request.params as { trackedProductId: string }).trackedProductId;
    const trackedProduct = await runtime.database.trackedProducts.getById(trackedProductId);
    if (!trackedProduct) {
      throw notFound(`Tracked product not found: ${trackedProductId}`);
    }

    const query = request.query as {
      limit?: string;
      offset?: string;
      start_at?: string;
      end_at?: string;
    };

    const limit = parsePositiveInt(query.limit, "limit", { defaultValue: 100, maximum: 500 });
    const offset = parseNonNegativeInt(query.offset, "offset", 0);
    const startAt = parseOptionalDateTimeQueryParam(query.start_at, "start_at");
    const endAt = parseOptionalDateTimeQueryParam(query.end_at, "end_at", true);

    if (startAt && endAt && startAt > endAt) {
      throw badRequest("start_at must be less than or equal to end_at.");
    }

    const historyRows = await runtime.database.priceHistory.listHistory({
      trackedProductId,
      limit: limit + 1,
      offset,
      startAt,
      endAt
    });

    const hasMore = historyRows.length > limit;
    const items = historyRows.slice(0, limit);

    return {
      product_id: trackedProductId,
      product_title: trackedProduct.productTitle,
      limit,
      offset,
      has_more: hasMore,
      next_offset: hasMore ? offset + items.length : null,
      start_at: startAt,
      end_at: endAt,
      items: items.map((item) => ({
        captured_at: item.capturedAt,
        product_title: item.productTitle,
        canonical_url: item.canonicalUrl,
        price: item.price,
        currency: item.currency,
        seller_name: item.sellerName,
        search_run_id: item.searchRunId
      }))
    };
  });

  app.get("/price-history/minimums", async (request) => {
    const query = request.query as {
      product_id?: string;
      period?: string;
      granularity?: string;
      start_at?: string;
      end_at?: string;
    };

    const productId = requireQueryString(query.product_id, "product_id");
    const period = parsePeriodOrGranularity(query.period, query.granularity);
    const startAt = parseDateTimeQueryParam(query.start_at, "start_at");
    const endAt = parseDateTimeQueryParam(query.end_at, "end_at", true);
    if (startAt > endAt) {
      throw badRequest("start_at must be less than or equal to end_at.");
    }

    const trackedProduct = await runtime.database.trackedProducts.getById(productId);
    if (!trackedProduct) {
      throw notFound(`Tracked product not found: ${productId}`);
    }

    const minimumRows = await runtime.database.priceHistory.listPeriodMinimums({
      trackedProductId: productId,
      period,
      startAt,
      endAt
    });

    return {
      product_id: productId,
      product_title: trackedProduct.productTitle,
      granularity: period,
      period,
      start_at: startAt,
      end_at: endAt,
      items: minimumRows.map((row) => ({
        period_start: row.periodStart,
        captured_at: row.capturedAt,
        product_title: trackedProduct.productTitle,
        source_product_title: row.productTitle,
        canonical_url: row.canonicalUrl,
        price: row.price,
        currency: row.currency,
        seller_name: row.sellerName,
        search_run_id: row.searchRunId
      }))
    };
  });

  app.setErrorHandler((error, _request, reply) => {
    const normalizedError =
      error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");

    if (isHttpError(normalizedError)) {
      void reply.code(normalizedError.statusCode).send({ error: normalizedError.message });
      return;
    }

    runtime.logger.error(
      {
        event: "api_request_failed",
        error: normalizedError.message
      },
      "api_request_failed"
    );
    void reply.code(500).send({
      error: normalizedError.message || "Internal server error",
      error_type: normalizedError.constructor.name
    });
  });

  return app;
}

function setCorsHeaders(
  reply: FastifyReply,
  origin: string,
  requestedHeaders: string | string[] | undefined
): void {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  reply.header(
    "Access-Control-Allow-Headers",
    requestedHeaders ?? "content-type,authorization"
  );
  reply.header("Vary", "Origin, Access-Control-Request-Headers");
}

function resolveCorsOrigin(originHeader: string | undefined): string | null {
  if (!originHeader) {
    return null;
  }

  try {
    const origin = new URL(originHeader);
    if (origin.hostname === "localhost" || origin.hostname === "drstone.leogendaryo.com") {
      return originHeader;
    }
  } catch {
    return null;
  }

  return null;
}

function requireTrackedProductBody(body: unknown): TrackedProductPayload {
  const parsed = trackedProductPatchSchema.safeParse(body);
  if (!parsed.success) {
    throw badRequest("JSON body must be an object");
  }

  return parsed.data;
}

function requireSearchTerms(payload: TrackedProductPayload): string[] {
  const searchTerms = coerceSearchTerms(payload);
  if (!searchTerms) {
    throw badRequest("search_terms is required");
  }

  return searchTerms;
}

function requireString(value: string | undefined, fieldName: string): string {
  const text = value?.trim();
  if (!text) {
    throw badRequest(`${fieldName} is required`);
  }

  return text;
}

function coerceSearchTerms(payload: TrackedProductPayload): string[] | null {
  if (payload.search_terms) {
    return normalizeSearchTerms(payload.search_terms);
  }

  if (payload.search_term) {
    return normalizeSearchTerms([payload.search_term]);
  }

  return null;
}

function rejectLegacyScrapeRateFields(payload: TrackedProductPayload): void {
  if (payload.scrapes_per_day !== undefined) {
    throw badRequest(
      "scrapes_per_day is not supported per product. Collection cadence is global."
    );
  }
}

function toTrackedProductResponse(trackedProduct: TrackedProduct) {
  return {
    id: trackedProduct.id,
    title: trackedProduct.productTitle,
    search_terms: trackedProduct.searchTerms,
    active: trackedProduct.active,
    created_at: trackedProduct.createdAt,
    updated_at: trackedProduct.updatedAt
  };
}

function toCollectionResultResponse(result: SearchCollectionResult) {
  return {
    tracked_product_id: result.trackedProductId,
    search_run_ids: result.searchRunIds,
    successful_runs: result.successfulRuns,
    failed_runs: result.failedRuns,
    total_results: result.totalResults,
    matched_results: result.matchedResults,
    page_count: result.pageCount
  };
}

function requireQueryString(value: string | undefined, fieldName: string): string {
  const text = value?.trim();
  if (!text) {
    throw badRequest(`${fieldName} is required`);
  }

  return text;
}

function parsePositiveInt(
  value: string | undefined,
  fieldName: string,
  options: { defaultValue?: number; maximum?: number } = {}
): number {
  if (!value) {
    if (options.defaultValue === undefined) {
      throw badRequest(`${fieldName} is required`);
    }

    return options.defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${fieldName} must be a positive integer.`);
  }

  if (options.maximum !== undefined && parsed > options.maximum) {
    throw badRequest(`${fieldName} must be less than or equal to ${options.maximum}.`);
  }

  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fieldName: string, defaultValue: number): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw badRequest(`${fieldName} must be a non-negative integer.`);
  }

  return parsed;
}

function parsePeriodOrGranularity(
  periodValue?: string,
  granularityValue?: string
): "day" | "week" | "month" {
  const period = periodValue?.trim().toLowerCase();
  const granularity = granularityValue?.trim().toLowerCase();

  if (!period && !granularity) {
    throw badRequest("period or granularity is required");
  }

  if (period && granularity && period !== granularity) {
    throw badRequest("period and granularity must match when both are provided.");
  }

  const selectedValue = granularity ?? period;
  if (selectedValue !== "day" && selectedValue !== "week" && selectedValue !== "month") {
    throw badRequest("period/granularity must be one of: day, week, month.");
  }

  return selectedValue;
}

function parseDateTimeQueryParam(
  value: string | undefined,
  fieldName: string,
  endOfDay = false
): string {
  const text = requireQueryString(value, fieldName).replace("Z", "+00:00");

  if (!text.includes("T") && !text.includes(" ")) {
    const date = new Date(`${text}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw badRequest(`Invalid ${fieldName}. Use YYYY-MM-DD or ISO 8601 datetime.`);
    }

    if (endOfDay) {
      return `${text}T23:59:59.999999+00:00`;
    }

    return `${text}T00:00:00+00:00`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`Invalid ${fieldName}. Use YYYY-MM-DD or ISO 8601 datetime.`);
  }

  return toOffsetIsoString(date);
}

function parseOptionalDateTimeQueryParam(
  value: string | undefined,
  fieldName: string,
  endOfDay = false
): string | null {
  return value ? parseDateTimeQueryParam(value, fieldName, endOfDay) : null;
}

function validateDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())) {
    throw badRequest("Invalid date. Use YYYY-MM-DD.");
  }
}

function toOffsetIsoString(value: Date): string {
  return value.toISOString().replace(".000Z", "+00:00").replace("Z", "+00:00");
}

function badRequest(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function notFound(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function isHttpError(error: Error): error is Error & { statusCode: number } {
  return typeof (error as { statusCode?: unknown }).statusCode === "number";
}
