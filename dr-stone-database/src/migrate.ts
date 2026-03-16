import process from "node:process";

import { applyMigrations, createPool, resolveMigrationsDirectory } from "./client/database.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = createPool(databaseUrl);

  try {
    const applied = await applyMigrations(pool, resolveMigrationsDirectory());
    process.stdout.write(JSON.stringify({ applied }) + "\n");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
