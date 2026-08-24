import { mkdir } from "node:fs/promises";
import { connect, type Database } from "@tursodatabase/sync";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { env } from "../lib/env";
import * as schema from "./schema";

await mkdir("data", { recursive: true });

export const syncClient = await connect({
  path: "data/local.db",
  url: env.tursoDbUrl,
  authToken: env.tursoDbToken,
  clientName: "pomodoro-server",
});

try {
  await syncClient.pull();
} catch {
  // First launch or no network: local replica stays readable and writable.
}

export const db = drizzle(async (sql, params, method) => querySyncClient(syncClient, sql, params, method), {
  schema,
});

export async function syncWithTurso(): Promise<void> {
  try {
    await syncClient.push();
  } catch {
    // Offline writes stay in the local replica until the next successful push.
  }

  try {
    await syncClient.pull();
  } catch {
    // Local data remains available when the remote cannot be reached.
  }
}

export async function querySyncClient(
  client: Database,
  sql: string,
  params: unknown[],
  method: "run" | "all" | "values" | "get",
): Promise<{ rows: unknown[] }> {
  const statement = await client.prepare(sql);
  statement.raw(true);

  try {
    switch (method) {
      case "run":
        await statement.run(...params);
        void syncClient.push().catch(() => undefined);
        return { rows: [] };
      case "get": {
        const row: unknown = await statement.get(...params);
        return { rows: Array.isArray(row) ? row : [] };
      }
      case "all":
      case "values":
        return { rows: await statement.all(...params) };
      default: {
        const _exhaustive: never = method;
        return _exhaustive;
      }
    }
  } finally {
    statement.close();
  }
}
