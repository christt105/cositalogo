import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { applyPlan, SCAN_USER } from "../tools/telegram-scan/apply.js";
import { wrapSqlite } from "../tools/telegram-scan/sqlite-d1.js";
import { clearSettingsCache } from "../tools/cositalogo-api/src/settings.js";
import { createD1 } from "./d1-shim.js";
import { config, link } from "./fixtures.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const POSTED = Date.UTC(2025, 2, 9, 10, 0, 0);
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

let db;

beforeEach(() => {
  clearSettingsCache();
  db = createD1(MIGRATIONS);
  for (const [key, value] of Object.entries(config())) {
    db.sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }
  for (const [id, title] of [[271110, "Capitán América: Civil War"], [929590, "Civil War"]]) {
    db.sqlite.prepare("INSERT INTO titles (type, tmdb_id, title, year, created_at, updated_at) VALUES ('movie', ?, ?, '2016', ?, ?)")
      .run(id, title, NOW - 1000, NOW - 1000);
  }
  for (const [id, tmdb] of [[1, 271110], [2, 271110], [3, 929590]]) {
    db.sqlite.prepare(
      "INSERT INTO links (id, type, tmdb_id, quality, url, link_key, created_at, updated_at) VALUES (?, 'movie', ?, '1080p', ?, ?, ?, ?)"
    ).run(id, tmdb, link(id * 10, 2), link(id * 10), NOW - 1000, NOW - 1000);
  }
});

const row = (id) => db.sqlite.prepare("SELECT * FROM links WHERE id = ?").get(id);

test("moves, updates and dates links through the API code, logged as the scan", async () => {
  const plan = {
    ops: [
      { op: "date", id: 1, created_at: POSTED },
      { op: "move", id: 1, type: "movie", tmdb: 929590, season: null },
      { op: "update", id: 1, fields: { audio: ["Castellano", "Inglés"], tags: ["auto"] } },
      { op: "update", id: 2, fields: { subs: ["Castellano"] } },
    ],
  };
  const { done, failures } = await applyPlan(db, plan, { now: () => NOW });
  assert.deepEqual(failures, []);
  assert.deepEqual(done, { date: 1, move: 1, update: 2 });

  const moved = row(1);
  assert.equal(moved.tmdb_id, 929590);
  assert.equal(moved.created_at, POSTED);
  assert.equal(moved.tags, '["auto"]');
  assert.equal(moved.audio, '["Castellano","Inglés"]');

  const audit = db.sqlite.prepare("SELECT user_id, action, target FROM audit ORDER BY id").all().map((r) => ({ ...r }));
  assert.deepEqual(audit, [
    { user_id: SCAN_USER.id, action: "move", target: "link:1" },
    { user_id: SCAN_USER.id, action: "update", target: "link:1" },
    { user_id: SCAN_USER.id, action: "update", target: "link:2" },
  ]);

  const civilWar = db.sqlite.prepare("SELECT created_at, json FROM titles WHERE tmdb_id = 929590").get();
  assert.equal(civilWar.created_at, POSTED, "a title is as old as its oldest link");
  assert.deepEqual(JSON.parse(civilWar.json).links.map((l) => l.tags), [["auto"], []]);
  const snapshot = JSON.parse(db.sqlite.prepare("SELECT body FROM snapshot").get().body);
  assert.deepEqual(snapshot.map((t) => t.tmdb), [271110, 929590], "newest first, by the Telegram dates");
});

test("a failed operation is reported and the rest still run", async () => {
  const plan = {
    ops: [
      { op: "update", id: 1, fields: { audio: ["Klingon"] } },
      { op: "update", id: 2, fields: { audio: ["Latino"] } },
    ],
  };
  const { done, failures } = await applyPlan(db, plan, { now: () => NOW });
  assert.equal(failures.length, 1);
  assert.match(failures[0].error, /Klingon/);
  assert.deepEqual(done, { update: 1 });
  assert.equal(row(1).audio, "[]");
  assert.equal(row(2).audio, '["Latino"]');
});

test("the recorded writes replay to the same database", async () => {
  const recorded = [];
  const target = new DatabaseSync(":memory:");
  const source = db.sqlite;
  target.exec(
    source.prepare("SELECT group_concat(sql, ';\n') AS ddl FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").get().ddl
  );
  for (const table of ["titles", "links", "settings", "snapshot"]) {
    for (const r of source.prepare(`SELECT * FROM ${table}`).all()) {
      const cols = Object.keys(r);
      target.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(...Object.values(r));
    }
  }
  const recording = wrapSqlite(source, { onWrite: (sql, params) => recorded.push([sql, params]) });
  await applyPlan(recording, { ops: [{ op: "move", id: 2, type: "movie", tmdb: 929590, season: null }] }, { now: () => NOW });
  for (const [sql, params] of recorded) target.prepare(sql).run(...params);
  for (const table of ["titles", "links", "audit", "snapshot"]) {
    const dump = (d) => JSON.stringify(d.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all());
    assert.equal(dump(target), dump(source), table);
  }
});
