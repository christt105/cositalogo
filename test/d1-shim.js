import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { wrapSqlite } from "../tools/telegram-scan/sqlite-d1.js";

/**
 * In-memory stand-in for a D1 binding backed by node:sqlite: same
 * prepare/bind/first/all/run/batch surface, batches run as one
 * transaction, and foreign keys are enforced as D1 does.
 */
export function createD1(migrationsDir) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return wrapSqlite(sqlite);
}
