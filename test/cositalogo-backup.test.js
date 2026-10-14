import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildImport } from "../tools/cositalogo-api/import/import.js";
import { exportBackup, writeBackup } from "../tools/cositalogo-api/backup/export.js";
import { readBackup, restoreSql } from "../tools/cositalogo-api/backup/restore.js";
import { catalogTmdb, config, link, yaml } from "./fixtures.js";
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
};

describe("Cositálogo backup", () => {
  let root;
  let cwd;
  let db;

  const queryOf = (target) => async (sql, params = []) => target.sqlite.prepare(sql).all(...params).map((r) => ({ ...r }));
  const rows = (target, table) => target.sqlite.prepare(`SELECT * FROM ${table} ORDER BY ${TABLES[table]}`).all().map((r) => ({ ...r }));
  const snapshot = (target) => ({ ...target.sqlite.prepare("SELECT version, body FROM snapshot").get() });

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cositalogo-backup-"));
    cwd = process.cwd();
    process.chdir(root);
    mkdirSync(join(root, "movies"));
    mkdirSync(join(root, "series"));
    writeFileSync(join(root, "movies", "550.yaml"), yaml({ links: [{ quality: "1080p", audio: ["Castellano"], link: link(1) }, { quality: "4K", link: link(2) }] }));
    writeFileSync(join(root, "movies", "680.yaml"), yaml({ poster: "https://example.com/pf.jpg", links: [{ quality: "1080p", link: link(3) }] }));
    writeFileSync(join(root, "series", "1396.yaml"), yaml({
      seasonPosters: { 2: "https://example.com/s2.jpg" },
      links: [
        { season: 1, quality: "1080p", subs: ["Forzados"], link: link(10) },
        { season: 2, quality: "1080p", link: link(11) },
        { season: "all", quality: "4K", link: link(13) },
      ],
    }));
  });

  after(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    db = createD1(MIGRATIONS);
    const { sql } = await buildImport({ tmdb: catalogTmdb(), config: config(), addedTimestamps: new Map(), now: NOW });
    db.sqlite.exec(sql);
    db.sqlite.exec(`
      INSERT INTO admins (user_id, name, added_by, created_at) VALUES (852128924, 'Christian', NULL, ${SEPTEMBER});
      INSERT INTO members (user_id, name, created_at) VALUES (852128924, 'Christian', ${SEPTEMBER}), (7, 'Ana', ${OCTOBER});
      INSERT INTO audit (at, user_id, action, target, before, after) VALUES
        (${SEPTEMBER}, 852128924, 'link.add', 'movie:550', NULL, '{"quality":"4K"}'),
        (${OCTOBER}, 7, 'link.edit', 'movie:680', '{"quality":"720p"}', '{"quality":"1080p"}');
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
      "admins.json", "audit/2026-09.json", "audit/2026-10.json", "members.json", "settings.json",
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
