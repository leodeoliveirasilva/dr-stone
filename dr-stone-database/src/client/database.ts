import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { schema } from "../schema.js";

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    allowExitOnIdle: true
  });
}

export function createDb(pool: Pool) {
  return drizzle(pool, { schema });
}

export async function applyMigrations(
  pool: Pool,
  migrationsDirectory = resolveMigrationsDirectory()
): Promise<string[]> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const appliedRows = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(appliedRows.rows.map((row: { filename: string }) => row.filename));
    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    const appliedNow: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, applied_at) VALUES ($1, $2)",
        [file, new Date().toISOString()]
      );
      appliedNow.push(file);
    }

    return appliedNow;
  } finally {
    client.release();
  }
}

export function resolveMigrationsDirectory(): string {
  if (process.env.DR_STONE_MIGRATIONS_DIR) {
    return path.resolve(process.env.DR_STONE_MIGRATIONS_DIR);
  }

  return path.resolve(process.cwd(), "dr-stone-database", "migrations");
}
