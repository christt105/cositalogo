import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { linkKey } from "../shared/rules.js";
import { isEntrypoint } from "../tools/cositalogo-api/backup/entrypoint.js";
import { exportBackup, writeBackup } from "../tools/cositalogo-api/backup/export.js";
import { readBackup, restoreSql } from "../tools/cositalogo-api/backup/restore.js";
import { config, link } from "./fixtures.js";
import { createD1 } from "./d1-shim.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const NOW = 1_760_000_000_000;
const OCTOBER = Date.UTC(2026, 9, 14);
const SEPTEMBER = Date.UTC(2026, 8, 30);
const TABLES = {
  titles: "type, tmdb_id",
  links: "id",
  settings: "key",
  admins: "user_id",
  members: "user_id",
  audit: "id",
  requests: "id",
  request_votes: "request_id, user_id",
};

const title = (type, tmdbId, name, extra = {}) => ({
  type, tmdb_id: tmdbId, imdb: null, title: name, original_title: name, english_title: null, year: "2000",
  tmdb_poster: `https://image.tmdb.org/t/p/w342/${tmdbId}.jpg`, poster: null, genres: ["Drama"], seasons: {},
  season_posters: {}, detail: {}, created_at: NOW, updated_at: NOW, ...extra,
});
let nextLinkId = 1;
const row = (url, fields) => ({
  id: nextLinkId++, season: null, quality: "1080p", audio: [], subs: [], tags: [], url, link_key: linkKey(url),
  added_by: null, created_at: NOW, updated_at: NOW, ...fields,
});

/** A backup with two movies and a series, as `exportBackup` writes it. */
function fixtureBackup() {
  nextLinkId = 1;
  const entry = (t, links) => [`titles/${t.type}/${t.tmdb_id}.json`, JSON.stringify({ title: t, links })];
  return new Map([
    ["settings.json", JSON.stringify(config())],
    ["admins.json", "[]"],
    ["members.json", "[]"],
    entry(title("movie", 550, "El club de la lucha"), [row(link(1), { audio: ["Castellano"] }), row(link(2), { quality: "4K" })]),
    entry(title("movie", 680, "Pulp Fiction", { poster: "https://example.com/pf.jpg" }), [row(link(3))]),
    entry(title("series", 1396, "Breaking Bad", { season_posters: { 2: "https://example.com/s2.jpg" } }), [
      row(link(10), { season: "1", subs: ["Forzados"] }),
      row(link(11), { season: "2" }),
      row(link(13), { season: "all", quality: "4K" }),
    ]),
  ]);
}

describe("Cositálogo backup", () => {
  let db;

  const queryOf = (target) => async (sql, params = []) => target.sqlite.prepare(sql).all(...params).map((r) => ({ ...r }));
  const rows = (target, table) => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${TABLES[table]}`).all().map((r) => ({ ...r }));
  const snapshot = (target) => ({ ...target.sqlite.prepare("SELECT version, body FROM snapshot").get() });

  beforeEach(() => {
    db = createD1(MIGRATIONS);
    db.sqlite.exec(restoreSql(fixtureBackup(), NOW));
    db.sqlite.exec(`
      INSERT INTO admins (user_id, name, added_by, created_at) VALUES (852128924, 'Christian', NULL, ${SEPTEMBER});
      INSERT INTO members (user_id, name, created_at) VALUES (852128924, 'Christian', ${SEPTEMBER}), (7, 'Ana', ${OCTOBER});
      INSERT INTO audit (at, user_id, action, target, before, after) VALUES
        (${SEPTEMBER}, 852128924, 'link.add', 'movie:550', NULL, '{"quality":"4K"}'),
        (${OCTOBER}, 7, 'link.edit', 'movie:680', '{"quality":"720p"}', '{"quality":"1080p"}');
      INSERT INTO requests (id, type, tmdb_id, season, title, season_name, year, poster, note, requested_by, created_at) VALUES
        (1, 'series', 1396, 5, 'Breaking Bad', 'Temporada 5', '2008', NULL, 'en VOSE', 7, ${OCTOBER});
      INSERT INTO request_votes (request_id, user_id, created_at) VALUES (1, 7, ${OCTOBER}), (1, 852128924, ${OCTOBER});
    `);
  });

  test("a restore into an empty database gives back every table and the same snapshot", async () => {
    const files = await exportBackup(queryOf(db));
    const restored = createD1(MIGRATIONS);
    restored.sqlite.exec(restoreSql(files, NOW + 1));
    for (const table of Object.keys(TABLES)) assert.deepEqual(rows(restored, table), rows(db, table), table);
    assert.equal(snapshot(restored).body, snapshot(db).body);
    assert.deepEqual(await exportBackup(queryOf(restored)), files);
  });

  test("writes one file per title, per audit month and the rest, with JSON columns parsed", async () => {
    const files = await exportBackup(queryOf(db));
    assert.deepEqual([...files.keys()].sort(), [
      "admins.json", "audit/2026-09.json", "audit/2026-10.json", "members.json", "request_votes.json", "requests.json", "settings.json",
      "titles/movie/550.json", "titles/movie/680.json", "titles/series/1396.json",
    ]);
    const series = JSON.parse(files.get("titles/series/1396.json"));
    assert.equal(series.title.json, undefined);
    assert.deepEqual(series.title.season_posters, { 2: "https://example.com/s2.jpg" });
    assert.deepEqual(series.links.map((l) => [l.season, l.subs]), [["1", ["Forzados"]], ["2", []], ["all", []]]);
    assert.deepEqual(JSON.parse(files.get("audit/2026-10.json"))[0].before, { quality: "720p" });
    assert.deepEqual(JSON.parse(files.get("settings.json")), config());
  });

  test("small pages give the same files", async () => {
    assert.deepEqual(await exportBackup(queryOf(db), { pageSize: 1 }), await exportBackup(queryOf(db)));
  });

  test("writing a backup drops the files of deleted titles and keeps unrelated files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cositalogo-backup-out-"));
    try {
      writeFileSync(join(dir, "README.md"), "backup\n");
      writeBackup(dir, await exportBackup(queryOf(db)));
      db.sqlite.exec("DELETE FROM links WHERE tmdb_id = 680; DELETE FROM titles WHERE tmdb_id = 680;");
      const files = await exportBackup(queryOf(db));
      writeBackup(dir, files);
      assert.equal(existsSync(join(dir, "titles/movie/680.json")), false);
      assert.equal(readFileSync(join(dir, "README.md"), "utf8"), "backup\n");
      assert.deepEqual(readBackup(dir), files);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a restore over existing data replaces it and moves the snapshot version forward", async () => {
    const files = await exportBackup(queryOf(db));
    files.delete("titles/movie/680.json");
    const before = snapshot(db).version;
    db.sqlite.exec("INSERT INTO login_requests (nonce, browser_hash, expires_at) VALUES ('n', 'h', 1)");
    db.sqlite.exec(restoreSql(files, 1));
    assert.deepEqual(rows(db, "titles").map((t) => t.tmdb_id), [550, 1396]);
    assert.equal(rows(db, "links").length, 5);
    assert.equal(snapshot(db).version, before + 1);
    assert.equal(JSON.parse(snapshot(db).body).length, 2);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM login_requests").get().n, 1);
  });
});

describe("backups from before requests", () => {
  test("restore without requests.json and request_votes.json", () => {
    const db = createD1(MIGRATIONS);
    db.sqlite.exec(restoreSql(fixtureBackup(), NOW));
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM requests").get().n, 0);
    const dir = mkdtempSync(join(tmpdir(), "cositalogo-backup-old-"));
    try {
      for (const name of ["settings.json", "admins.json", "members.json"]) writeFileSync(join(dir, name), fixtureBackup().get(name));
      assert.deepEqual([...readBackup(dir).keys()].sort(), ["admins.json", "members.json", "settings.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("isEntrypoint", () => {
  test("matches the started script through a symlink and rejects other modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "entry-"));
    try {
      const real = join(dir, "script.js");
      const alias = join(dir, "alias.js");
      writeFileSync(real, "");
      symlinkSync(real, alias);
      const url = pathToFileURL(real).href;
      assert.equal(isEntrypoint(url, real), true);
      assert.equal(isEntrypoint(url, alias), true);
      assert.equal(isEntrypoint(url, join(dir, "other.js")), false);
      assert.equal(isEntrypoint(url, undefined), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
