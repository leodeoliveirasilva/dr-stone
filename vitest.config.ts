import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@dr-stone/api": path.resolve(__dirname, "dr-stone-api/src/index.ts"),
      "@dr-stone/database": path.resolve(__dirname, "dr-stone-database/src/index.ts"),
      "@dr-stone/scrapper": path.resolve(__dirname, "dr-stone-scrapper/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000
  }
});
