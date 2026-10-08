import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const READS = /^\s*(SELECT|WITH)\b|\bRETURNING\b/i;

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

  function execute(sql, params) {
    const stmt = sqlite.prepare(sql);
    if (READS.test(sql)) {
      const results = stmt.all(...params).map((row) => ({ ...row }));
      return { success: true, results, meta: { changes: /^\s*SELECT/i.test(sql) ? 0 : results.length } };
    }
    const info = stmt.run(...params);
    return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }

  function statement(sql, params = []) {
    return {
      sql,
      params,
      bind: (...values) => statement(sql, values),
      async first(column) {
        const row = execute(sql, params).results[0] ?? null;
        return column && row ? row[column] : row;
      },
      async all() {
        return execute(sql, params);
      },
      async run() {
        return execute(sql, params);
      },
    };
  }

  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = statements.map((s) => execute(s.sql, s.params));
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
}
