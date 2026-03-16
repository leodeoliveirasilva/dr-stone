import type { ScrapeFailure } from "@dr-stone/database";

import { FetchError, ParseError } from "./errors.js";

export function buildScrapeFailure(
  source: string,
  targetUrl: string,
  error: unknown
): ScrapeFailure {
  if (error instanceof FetchError) {
    return {
      source,
      stage: "fetch",
      errorCode: error.code,
      errorType: error.constructor.name,
      message: error.message,
      targetUrl: error.url ?? targetUrl,
      retriable: error.retriable,
      httpStatus: error.statusCode ?? null,
      finalUrl: error.finalUrl ?? null,
      details: error.details,
      capturedAt: new Date().toISOString()
    };
  }

  if (error instanceof ParseError) {
    return {
      source,
      stage: "parse",
      errorCode: error.code,
      errorType: error.constructor.name,
      message: error.message,
      targetUrl,
      retriable: false,
      details: error.details,
      capturedAt: new Date().toISOString()
    };
  }

  return {
    source,
    stage: "unknown",
    errorCode: "unexpected_error",
    errorType: error instanceof Error ? error.constructor.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    targetUrl,
    retriable: false,
    details: {},
    capturedAt: new Date().toISOString()
  };
}
