import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "inspect.amazon.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    browserName: "chromium",
    headless: process.env.HEADED !== "1",
    viewport: { width: 1440, height: 1600 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    extraHTTPHeaders: {
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  }
});
