import type { Browser, BrowserContext, LaunchOptions } from "playwright";

import type { ScrapperSettings } from "../types.js";

const DEFAULT_VIEWPORT = { width: 1366, height: 768 } as const;
const DEFAULT_ACCEPT_LANGUAGE = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7";
const DEFAULT_BROWSER_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage",
  "--no-sandbox"
] as const;

export interface BrowserLaunchOverrides {
  proxySessionId?: string | null;
}

export function buildBrowserLaunchOptions(
  settings: Pick<ScrapperSettings, "proxyServer" | "proxyUsername" | "proxyPassword">,
  overrides: BrowserLaunchOverrides = {}
): LaunchOptions {
  return {
    headless: true,
    args: [...DEFAULT_BROWSER_ARGS],
    proxy: settings.proxyServer
      ? {
          server: settings.proxyServer,
          username: buildProxyUsername(settings.proxyUsername, overrides.proxySessionId),
          password: settings.proxyPassword ?? undefined
        }
      : undefined
  };
}

export function buildProxyUsername(
  proxyUsername: string | null | undefined,
  proxySessionId: string | null | undefined
): string | undefined {
  const normalizedUsername = proxyUsername?.trim();
  if (!normalizedUsername) {
    return undefined;
  }

  const normalizedSessionId = proxySessionId?.trim();
  if (!normalizedSessionId) {
    return normalizedUsername;
  }

  return `${normalizedUsername}-session-${normalizedSessionId}`;
}

export async function createStealthBrowserContext(
  browser: Browser,
  settings: Pick<ScrapperSettings, "userAgent">
): Promise<BrowserContext> {
  const context = await browser.newContext({
    locale: "pt-BR",
    userAgent: settings.userAgent,
    viewport: DEFAULT_VIEWPORT,
    colorScheme: "light",
    deviceScaleFactor: 1,
    extraHTTPHeaders: {
      "accept-language": DEFAULT_ACCEPT_LANGUAGE
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["pt-BR", "pt", "en-US", "en"]
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4]
    });
    Object.defineProperty(navigator, "platform", {
      get: () => "Linux x86_64"
    });
    Object.defineProperty(navigator, "vendor", {
      get: () => "Google Inc."
    });

    const browserGlobal = globalThis as typeof globalThis & {
      chrome?: {
        runtime?: Record<string, never>;
      };
    };

    browserGlobal.chrome ??= {
      runtime: {}
    };
  });

  return context;
}
