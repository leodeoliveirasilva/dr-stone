import { test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type ObservedResponse = {
  url: string;
  status: number;
  resourceType: string;
  contentType: string | null;
};

type ProductCandidate = {
  title: string | null;
  href: string | null;
  asin: string | null;
  wholePrice: string | null;
  fractionPrice: string | null;
  ariaPrice: string | null;
  badge: string | null;
};

type InspectionReport = {
  startedAt: string;
  target: string;
  finalUrl: string;
  pageTitle: string;
  challengeSignals: string[];
  summary: {
    detectedChallenge: boolean;
    detectedSearchResults: boolean;
    detectedProductPage: boolean;
    detectedErrorPage: boolean;
  };
  dom: {
    canonicalUrl: string | null;
    resultCount: number;
    productTitle: string | null;
    productPriceText: string | null;
    sellerText: string | null;
  };
  searchResults: ProductCandidate[];
  network: {
    documentResponses: ObservedResponse[];
    xhrResponses: ObservedResponse[];
    failedRequests: string[];
  };
};

const DEFAULT_TARGET =
  process.env.AMAZON_TARGET_URL?.trim() || "https://www.amazon.com.br/s?k=rx+9070+xt";

test("inspect amazon page behavior", async ({ page }, testInfo) => {
  const observedDocumentResponses: ObservedResponse[] = [];
  const observedXhrResponses: ObservedResponse[] = [];
  const failedRequests: string[] = [];

  page.on("response", async (response) => {
    const request = response.request();
    const entry: ObservedResponse = {
      url: response.url(),
      status: response.status(),
      resourceType: request.resourceType(),
      contentType: response.headers()["content-type"] ?? null
    };

    if (request.resourceType() === "document") {
      observedDocumentResponses.push(entry);
      return;
    }

    if (request.resourceType() === "fetch" || request.resourceType() === "xhr") {
      observedXhrResponses.push(entry);
    }
  });

  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.resourceType()} ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
  });

  await page.goto(DEFAULT_TARGET, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(8_000);

  const challengeSignals = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const signals: string[] = [];

    if (html.includes("AwsWafIntegration")) {
      signals.push("AwsWafIntegration");
    }
    if (html.includes("challenge.js")) {
      signals.push("challenge.js");
    }
    if (document.querySelector("#challenge-container")) {
      signals.push("#challenge-container");
    }
    if (document.body.innerText.includes("não é um robô")) {
      signals.push("robot_check_pt_br_text");
    }
    if (document.body.innerText.includes("not a robot")) {
      signals.push("robot_check_en_text");
    }
    if (document.body.innerText.includes("Algo deu errado")) {
      signals.push("amazon_generic_error_text");
    }
    if (document.body.innerText.includes("Erro de serviço indisponível")) {
      signals.push("service_unavailable_text");
    }

    return signals;
  });

  const domSnapshot = await page.evaluate(() => {
    const firstNonEmptyText = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const text = document.querySelector(selector)?.textContent?.trim();
        if (text) {
          return text;
        }
      }
      return null;
    };

    const canonicalUrl =
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;

    const searchNodes = Array.from(document.querySelectorAll('[data-component-type="s-search-result"]'));
    const searchResults = searchNodes.slice(0, 12).map((node) => {
      const titleNode = node.querySelector("h2 span");
      const hrefNode =
        node.querySelector<HTMLAnchorElement>('a[href*="/dp/"]') ??
        node.querySelector<HTMLAnchorElement>("h2 a");
      const wholePrice = node.querySelector(".a-price-whole")?.textContent?.trim() ?? null;
      const fractionPrice = node.querySelector(".a-price-fraction")?.textContent?.trim() ?? null;
      const ariaPrice = node.querySelector(".a-price [aria-hidden='true']")?.textContent?.trim() ?? null;

      return {
        title: titleNode?.textContent?.trim() ?? null,
        href: hrefNode?.href ?? null,
        asin: node.getAttribute("data-asin"),
        wholePrice,
        fractionPrice,
        ariaPrice,
        badge: node.querySelector(".a-badge-label-inner")?.textContent?.trim() ?? null
      };
    });

    const productTitle = firstNonEmptyText(["#productTitle", "#title"]);

    const productPriceText = firstNonEmptyText([
      ".apexPriceToPay .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#desktop_qualifiedBuyBox .a-price .a-offscreen",
      ".a-price .a-offscreen"
    ]);

    const sellerText = firstNonEmptyText([
      "#sellerProfileTriggerId",
      "#merchant-info",
      "#merchantInfoFeature_feature_div",
      "#shipsFromSoldBy_feature_div",
      "#tabular-buybox"
    ]);

    const bodyText = document.body.innerText;

    return {
      canonicalUrl,
      resultCount: searchNodes.length,
      searchResults,
      productTitle,
      productPriceText,
      sellerText,
      detectedErrorPage:
        bodyText.includes("Algo deu errado") || bodyText.includes("Erro de serviço indisponível")
    };
  });

  const report: InspectionReport = {
    startedAt: new Date().toISOString(),
    target: DEFAULT_TARGET,
    finalUrl: page.url(),
    pageTitle: await page.title(),
    challengeSignals,
    summary: {
      detectedChallenge: challengeSignals.length > 0,
      detectedSearchResults: domSnapshot.resultCount > 0,
      detectedProductPage: Boolean(domSnapshot.productTitle),
      detectedErrorPage: domSnapshot.detectedErrorPage
    },
    dom: {
      canonicalUrl: domSnapshot.canonicalUrl,
      resultCount: domSnapshot.resultCount,
      productTitle: domSnapshot.productTitle,
      productPriceText: domSnapshot.productPriceText,
      sellerText: domSnapshot.sellerText
    },
    searchResults: domSnapshot.searchResults,
    network: {
      documentResponses: observedDocumentResponses,
      xhrResponses: observedXhrResponses.slice(0, 100),
      failedRequests: failedRequests.slice(0, 100)
    }
  };

  const artifactDir = path.join(testInfo.outputDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, "page.png"), fullPage: true });
  await writeFile(path.join(artifactDir, "report.json"), JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
});
