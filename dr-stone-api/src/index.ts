import process from "node:process";

import { createApp } from "./app.js";
import { loadApiSettings } from "./env.js";

async function main(): Promise<void> {
  await import("dotenv/config");
  const settings = loadApiSettings();
  const app = await createApp(settings);
  await app.listen({
    host: settings.host,
    port: settings.port
  });
}

if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export { createApp };
