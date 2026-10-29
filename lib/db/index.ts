import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "@/lib/env";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db", "migrations");

const globalForDb = globalThis as unknown as { statediffDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (globalForDb.statediffDb) return globalForDb.statediffDb;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const conn = openDatabase(path.join(dir, "statediff.db"));
  globalForDb.statediffDb = conn;
  return conn;
}

export function openDatabase(file: string): DatabaseSync {
  const conn = new DatabaseSync(file);
  conn.exec("pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000;");
  migrate(conn);
  return conn;
}

function migrate(conn: DatabaseSync) {
  conn.exec("create table if not exists schema_migrations (id text primary key, applied_at text not null)");
  const applied = new Set(
    (conn.prepare("select id from schema_migrations").all() as { id: string }[]).map((r) => r.id),
  );
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    transaction(conn, () => {
      conn.exec(sql);
      conn.prepare("insert into schema_migrations (id, applied_at) values (?, ?)").run(file, now());
    });
  }
}

/** Runs fn inside BEGIN IMMEDIATE so concurrent writers serialize (e.g. duplicate seal requests). */
export function transaction<T>(conn: DatabaseSync, fn: () => T): T {
  conn.exec("begin immediate");
  try {
    const result = fn();
    conn.exec("commit");
    return result;
  } catch (err) {
    conn.exec("rollback");
    throw err;
  }
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text == null) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
