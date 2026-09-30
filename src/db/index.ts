import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

let _db: Db | undefined;

/**
 * Neon's HTTP driver in production. For local development against a plain
 * Postgres (no Neon proxy) set DATABASE_DRIVER=pg.
 * No code path uses transactions, so both drivers behave the same.
 */
export function db(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.DATABASE_DRIVER === "pg") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as typeof import("pg");
    _db = drizzlePg(new Pool({ connectionString: url }), { schema }) as unknown as Db;
  } else {
    _db = drizzleNeon(neon(url), { schema });
  }
  return _db;
}

export * from "./schema";
