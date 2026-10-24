/**
 * Runs the operations of a plan (plan.py) against a SQLite copy of the
 * catalog database, through the same functions the API uses, so audit rows,
 * validation and title fragments come out as if a person had made each
 * change from the web. The snapshot is rebuilt once at the end instead of
 * after every change: each rebuild reads every title, and thousands of them
 * on the remote database exhaust D1's daily row-read allowance.
 *
 * Usage: node apply.js <plan.json> <database.sqlite> [--record <out.sql>]
 *
 * <database.sqlite> is the local D1 file of `wrangler dev` (or any copy
 * restored from a backup). With --record, every committed write is also
 * written to <out.sql>, starting with a guard that fails unless the target
 * database still has the snapshot version this copy had; running that file
 * with `wrangler d1 execute --remote --file` repeats the same changes on a
 * database in the same state. Needs TMDB_API_KEY for titles that are new.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { addLink, moveLink, updateLink } from "../cositalogo-api/src/links.js";
import { snapshotSql } from "../cositalogo-api/src/catalog.js";
import { loadSettings } from "../cositalogo-api/src/settings.js";
import { literal } from "../cositalogo-api/backup/restore.js";
import { isEntrypoint } from "../cositalogo-api/backup/entrypoint.js";
import { wrapSqlite } from "./sqlite-d1.js";

export const SCAN_USER = { id: 0, name: "Escaneo del canal", admin: true };

const seasonOf = (season) => (season === null || season === undefined ? undefined : /^\d+$/.test(season) ? Number(season) : season);

function inline(sql, params) {
  let i = 0;
  return sql.replace(/\?/g, () => literal(params[i++]));
}

/**
 * A view of a D1 binding where the snapshot rebuild is a no-op, so the API
 * functions can run unchanged without rebuilding it after every write.
 */
export function withoutSnapshot(db) {
  const sql = snapshotSql();
  const skipped = { success: true, results: [], meta: { changes: 0 } };
  const noop = { skip: true, bind: () => noop, first: async () => null, all: async () => skipped, run: async () => skipped };
  return {
    prepare: (text) => (text === sql ? noop : db.prepare(text)),
    async batch(statements) {
      const real = statements.filter((s) => !s.skip);
      const results = real.length ? await db.batch(real) : [];
      let i = 0;
      return statements.map((s) => (s.skip ? skipped : results[i++]));
    },
  };
}

/** Runs one operation; returns null on success or the error message. */
async function runOp(env, settings, op, now) {
  const db = env.DB;
  switch (op.op) {
    case "date":
      await db.prepare("UPDATE links SET created_at = ? WHERE id = ?").bind(op.created_at, op.id).run();
      return;
    case "move":
      await moveLink(env, SCAN_USER, settings, op.id, { type: op.type, tmdb: op.tmdb, season: seasonOf(op.season) }, now);
      return;
    case "update": {
      const fields = { ...op.fields };
      if ("season" in fields) fields.season = seasonOf(fields.season);
      await updateLink(env, SCAN_USER, settings, op.id, fields, now);
      return;
    }
    case "add": {
      const body = { type: op.type, tmdb: op.tmdb, quality: op.quality, audio: op.audio, subs: op.subs, tags: op.tags, link: op.link };
      if (op.type === "series") body.season = seasonOf(op.season);
      const link = await addLink(env, SCAN_USER, settings, body, now);
      await db.prepare("UPDATE links SET created_at = ? WHERE id = ?").bind(op.created_at, link.id).run();
      return;
    }
    default:
      throw new Error(`unknown operation ${op.op}`);
  }
}

/**
 * Applies the plan's operations in order, then moves each title's
 * `created_at` back to its oldest link so the catalog's "newest first" order
 * follows the Telegram dates, and rebuilds the snapshot. Failed operations
 * are rolled back one by one and reported, the rest go on.
 */
export async function applyPlan(db, plan, { tmdbKey, now = () => Date.now(), log = () => {} } = {}) {
  const env = { DB: withoutSnapshot(db), TMDB_API_KEY: tmdbKey };
  const settings = await loadSettings(db);
  const failures = [];
  const done = {};
  for (const op of plan.ops) {
    try {
      await runOp(env, settings, op, now());
      done[op.op] = (done[op.op] ?? 0) + 1;
    } catch (err) {
      failures.push({ op, error: String(err?.message ?? err) });
      log(`failed ${op.op} ${op.id ?? op.link}: ${err?.message ?? err}`);
    }
  }
  await db.batch([
    db.prepare(
      "UPDATE titles SET created_at = (SELECT min(l.created_at) FROM links l WHERE l.type = titles.type AND l.tmdb_id = titles.tmdb_id) " +
        "WHERE created_at > (SELECT min(l.created_at) FROM links l WHERE l.type = titles.type AND l.tmdb_id = titles.tmdb_id)"
    ),
    db.prepare(snapshotSql()).bind(now()),
  ]);
  return { done, failures };
}

async function main() {
  const [planPath, dbPath, ...rest] = process.argv.slice(2);
  if (!planPath || !dbPath) throw new Error("usage: node apply.js <plan.json> <database.sqlite> [--record <out.sql>]");
  const recordAt = rest.indexOf("--record");
  const recordPath = recordAt === -1 ? null : rest[recordAt + 1];
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  const version = sqlite.prepare("SELECT version FROM snapshot WHERE id = 1").get()?.version ?? 0;
  const recorded = [
    `-- generated by tools/telegram-scan/apply.js from ${planPath}`,
    `SELECT json('snapshot changed since the plan was applied locally, aborting') FROM snapshot WHERE id = 1 AND version != ${version};`,
  ];
  const db = wrapSqlite(sqlite, { onWrite: (sql, params) => recorded.push(`${inline(sql, params)};`) });
  const { done, failures } = await applyPlan(db, plan, { tmdbKey: process.env.TMDB_API_KEY, log: console.error });
  if (recordPath) writeFileSync(recordPath, recorded.join("\n") + "\n");
  console.log(JSON.stringify({ done, failed: failures.length }, null, 1));
  if (failures.length) writeFileSync(`${planPath}.failures.json`, JSON.stringify(failures, null, 1));
}

if (isEntrypoint(import.meta.url)) await main();
