import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isEntrypoint } from "../../../scripts/lib.js";
import {
  AUDIT_JSON,
  DIRECTORIES,
  LINK_JSON,
  SINGLE_FILES,
  TITLE_JSON,
  auditPath,
  parseColumns,
  serialize,
  titlePath,
} from "./format.js";

/** Every row of a table in key order, read in pages so no single response gets large. */
async function readAll(query, table, columns, keys, pageSize) {
  const rows = [];
  let last = null;
  for (;;) {
    const after = last ? `WHERE (${keys.join(", ")}) > (${keys.map(() => "?").join(", ")}) ` : "";
    const page = await query(
      `SELECT ${columns} FROM ${table} ${after}ORDER BY ${keys.join(", ")} LIMIT ${pageSize}`,
      last ? keys.map((k) => last[k]) : []
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
    last = page[page.length - 1];
  }
}

const TITLE_COLUMNS =
  "type, tmdb_id, imdb, title, original_title, english_title, year, tmdb_poster, poster, " +
  "genres, seasons, season_posters, detail, created_at, updated_at";

/**
 * The backup files of a database, as a map from relative path to content.
 * `query(sql, params)` runs one read and returns its rows. The same data
 * always gives the same files, so a commit only happens when something
 * changed.
 */
export async function exportBackup(query, { pageSize = 500 } = {}) {
  const files = new Map();
  const titles = await readAll(query, "titles", TITLE_COLUMNS, ["type", "tmdb_id"], pageSize);
  const links = await readAll(query, "links", "*", ["id"], pageSize);
  const byTitle = new Map();
  for (const { type, tmdb_id: tmdbId, ...link } of links) {
    const key = `${type}:${tmdbId}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(parseColumns(link, LINK_JSON));
  }
  for (const title of titles) {
    files.set(titlePath(title.type, title.tmdb_id), serialize({
      title: parseColumns(title, TITLE_JSON),
      links: byTitle.get(`${title.type}:${title.tmdb_id}`) ?? [],
    }));
  }

  const settings = await query("SELECT key, value FROM settings ORDER BY key");
  files.set("settings.json", serialize(Object.fromEntries(settings.map((r) => [r.key, JSON.parse(r.value)]))));
  files.set("admins.json", serialize(await query("SELECT * FROM admins ORDER BY user_id")));
  files.set("members.json", serialize(await query("SELECT * FROM members ORDER BY user_id")));

  const months = new Map();
  for (const entry of await readAll(query, "audit", "*", ["id"], pageSize)) {
    const path = auditPath(entry.at);
    if (!months.has(path)) months.set(path, []);
    months.get(path).push(parseColumns(entry, AUDIT_JSON));
  }
  for (const [path, entries] of months) files.set(path, serialize(entries));
  return files;
}

/** Replaces the backup files under `dir` with `files`, leaving anything else there (.git, README) alone. */
export function writeBackup(dir, files) {
  for (const name of [...DIRECTORIES, ...SINGLE_FILES]) rmSync(join(dir, name), { recursive: true, force: true });
  for (const [path, content] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
}

/** A `query` that reads a remote D1 database through the Cloudflare API. */
export function d1Query({ accountId, databaseId, token }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  return async (sql, params = []) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(`D1 answered ${res.status}: ${JSON.stringify(body.errors ?? body)}`);
    return body.result[0].results;
  };
}

function databaseIdFromWrangler() {
  const toml = readFileSync(fileURLToPath(new URL("../wrangler.toml", import.meta.url)), "utf8");
  const match = /^database_id\s*=\s*"([^"]+)"/m.exec(toml);
  if (!match) throw new Error("no database_id in wrangler.toml");
  return match[1];
}

async function main() {
  const dir = process.argv[2];
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: token } = process.env;
  if (!dir || !accountId || !token) {
    console.error("usage: CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node export.js <backup directory>");
    process.exit(2);
  }
  const databaseId = process.env.D1_DATABASE_ID ?? databaseIdFromWrangler();
  const files = await exportBackup(d1Query({ accountId, databaseId, token }));
  writeBackup(dir, files);
  const titles = [...files.keys()].filter((p) => p.startsWith("titles/")).length;
  console.log(`export: wrote ${titles} titles and ${files.size - titles} other files to ${dir}`);
}

if (isEntrypoint(import.meta.url)) {
  await main();
}
