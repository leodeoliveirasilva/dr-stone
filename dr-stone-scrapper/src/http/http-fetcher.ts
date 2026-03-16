import { setTimeout as sleep } from "node:timers/promises";

import { FetchError } from "../errors.js";
import type { LoggerLike, ScrapperSettings } from "../types.js";

export interface FetchResponse {
  text: string;
  url: string;
  status: number;
}

export class HttpFetcher {
  constructor(
    private readonly settings: ScrapperSettings,
    private readonly logger: LoggerLike
  ) {}

  async get(url: string): Promise<FetchResponse> {
    let lastError: FetchError | undefined;

    for (let attempt = 1; attempt <= this.settings.maxRetries + 1; attempt += 1) {
      try {
        if (attempt === 1 && this.settings.requestDelaySeconds > 0) {
          await sleep(this.settings.requestDelaySeconds * 1000);
        }

        const response = await fetch(url, {
          headers: {
            "accept": "text/html,application/xhtml+xml",
            "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "user-agent": this.settings.userAgent
          },
          redirect: "follow",
          signal: AbortSignal.timeout(this.settings.timeoutSeconds * 1000)
        });

        const text = await response.text();
        if (response.status >= 400) {
          throw new FetchError(`HTTP request failed with status ${response.status}`, {
            code: response.status >= 500 ? "http_server_error" : "http_client_error",
            retriable: response.status >= 500,
            statusCode: response.status,
            url,
            finalUrl: response.url,
            details: {}
          });
        }

        if (text.trim().length === 0) {
          throw new FetchError("Response body is empty", {
            code: "empty_body",
            retriable: false,
            statusCode: response.status,
            url,
            finalUrl: response.url
          });
        }

        this.logger.info(
          {
            event: "http_fetch_succeeded",
            url: response.url,
            statusCode: response.status,
            attempt
          },
          "http_fetch_succeeded"
        );

        return {
          text,
          url: response.url,
          status: response.status
        };
      } catch (error) {
        lastError =
          error instanceof FetchError
            ? error
            : new FetchError("Network error while fetching page", {
                code: "network_error",
                retriable: true,
                url,
                details: {
                  error: error instanceof Error ? error.message : String(error)
                }
              });

        this.logger.warn(
          {
            event: "http_fetch_failed",
            url,
            attempt,
            error: lastError.message,
            errorCode: lastError.code,
            retriable: lastError.retriable,
            statusCode: lastError.statusCode
          },
          "http_fetch_failed"
        );

        if (!lastError.retriable || attempt > this.settings.maxRetries) {
          break;
        }

        await sleep(this.settings.retryBackoffSeconds * attempt * 1000);
      }
    }

    throw lastError ?? new FetchError(`Unable to fetch ${url}`, { url });
  }
}
