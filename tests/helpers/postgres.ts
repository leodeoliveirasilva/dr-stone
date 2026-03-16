import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { applyMigrations, createDatabaseServices } from "../../dr-stone-database/src/index.js";

export async function withTemporaryDatabase<T>(
  callback: (databaseUrl: string) => Promise<T>
): Promise<T> {
  const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!baseDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is not set");
  }

  const databaseName = `dr_stone_test_${randomUUID().replaceAll("-", "")}`;
  const adminUrl = replaceDatabaseName(baseDatabaseUrl, "postgres");
  const databaseUrl = replaceDatabaseName(baseDatabaseUrl, databaseName);

  const adminClient = new Client({ connectionString: adminUrl });
  await adminClient.connect();

  try {
    await adminClient.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await adminClient.end();
  }

  try {
    return await callback(databaseUrl);
  } finally {
    const cleanupClient = new Client({ connectionString: adminUrl });
    await cleanupClient.connect();

    try {
      await cleanupClient.query(
        `
          SELECT pg_terminate_backend(pid)
          FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()
        `,
        [databaseName]
      );
      await cleanupClient.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    } finally {
      await cleanupClient.end();
    }
  }
}

export async function createTestDatabaseServices(databaseUrl: string) {
  const database = createDatabaseServices(databaseUrl);
  await applyMigrations(database.pool);
  return database;
}

function replaceDatabaseName(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
