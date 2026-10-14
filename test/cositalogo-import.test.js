import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildImport } from "../tools/cositalogo-api/import/import.js";
import { compareCatalogs, formatReport } from "../tools/cositalogo-api/import/compare.js";
import { loadTitleEntries } from "../scripts/build.js";
import { catalogTmdb as tmdbStub, config, link, yaml } from "./fixtures.js";
import { createD1 } from "./d1-shim.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const NOW = 1_760_000_000_000;

describe("Cositálogo import", () => {
  let root;
  let cwd;
  let db;

  const write = (type, id, data) => writeFileSync(join(root, type, `${id}.yaml`), yaml(data));
  const remove = (type, id) => rmSync(join(root, type, `${id}.yaml`));

  async function runImport(now = NOW) {
    const result = await buildImport({ tmdb: tmdbStub(), config: config(), addedTimestamps: new Map(), now });
    db.sqlite.exec(result.sql);
    return result;
  }

  async function expectedCatalog() {
    const { groups, qualities } = config();
    const built = await loadTitleEntries({ tmdb: tmdbStub(), groups, qualities }, { addedTimestamps: new Map(), now: NOW / 1000 });
    return built.sort((a, b) => b.addedAt - a.addedAt || a.entry.title.localeCompare(b.entry.title, "es")).map((b) => b.entry);
  }

  const served = () => JSON.parse(db.sqlite.prepare("SELECT body FROM snapshot WHERE id = 1").get().body);
  const writes = () => Number(db.sqlite.prepare("SELECT total_changes() AS n").get().n);
  const linkIds = (type, id) => db.sqlite.prepare("SELECT id FROM links WHERE type = ? AND tmdb_id = ? ORDER BY id").all(type, id).map((r) => r.id);

  before(() => {
    root = mkdtempSync(join(tmpdir(), "cositalogo-import-"));
    cwd = process.cwd();
    process.chdir(root);
  });

  after(() => {
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    rmSync(join(root, "movies"), { recursive: true, force: true });
    rmSync(join(root, "series"), { recursive: true, force: true });
    mkdirSync(join(root, "movies"));
    mkdirSync(join(root, "series"));
    db = createD1(MIGRATIONS);
    write("movies", 550, { links: [{ quality: "1080p", audio: ["Castellano"], link: link(1) }, { quality: "4K", link: link(2) }] });
    write("movies", 680, { poster: "https://example.com/pf.jpg", links: [{ quality: "1080p", link: link(3) }] });
    write("series", 1396, {
      seasonPosters: { 2: "https://example.com/s2.jpg" },
      links: [
        { season: 1, quality: "1080p", link: link(10) },
        { season: 2, quality: "1080p", link: link(11) },
        { season: 9, quality: "1080p", link: link(12) },
        { season: "all", quality: "4K", link: link(13) },
      ],
    });
  });

  test("an import reproduces the catalog the build publishes", async () => {
    const result = await runImport();
    assert.deepEqual([result.titles, result.links], [3, 7]);
    const report = compareCatalogs(await expectedCatalog(), served());
    assert.equal(report.equal, true, formatReport(report));
    assert.equal(report.sameOrder, true);
    assert.deepEqual(served().map((e) => e.title), ["Breaking Bad", "El club de la lucha", "Pulp Fiction"]);
  });

  test("loads the settings and keeps the manual posters apart from TMDB's", async () => {
    await runImport();
    const settings = Object.fromEntries(db.sqlite.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, JSON.parse(r.value)]));
    assert.deepEqual(settings, config());
    const movie = db.sqlite.prepare("SELECT poster, tmdb_poster FROM titles WHERE tmdb_id = 680").get();
    assert.deepEqual({ ...movie }, { poster: "https://example.com/pf.jpg", tmdb_poster: "https://image.tmdb.org/t/p/w342/pf.jpg" });
    const series = db.sqlite.prepare("SELECT seasons, season_posters FROM titles WHERE tmdb_id = 1396").get();
    assert.deepEqual(Object.keys(JSON.parse(series.seasons)), ["1", "2"]);
    assert.deepEqual(JSON.parse(series.season_posters), { 2: "https://example.com/s2.jpg" });
  });

  test("running it again with the same files writes nothing", async () => {
    await runImport();
    const before = writes();
    const version = db.sqlite.prepare("SELECT version FROM snapshot").get().version;
    await runImport(NOW + 60_000);
    assert.equal(writes(), before);
    assert.equal(db.sqlite.prepare("SELECT version FROM snapshot").get().version, version);
  });

  test("picks up added, changed and removed files, keeping link order", async () => {
    await runImport();
    write("movies", 550, { links: [{ quality: "1080p", link: link(1) }, { quality: "1080p", link: link(4) }, { quality: "4K", link: link(2) }] });
    remove("movies", 680);
    write("series", 1396, { links: [{ season: 1, quality: "4K", link: link(10) }] });
    await runImport(NOW + 60_000);
    const report = compareCatalogs(await expectedCatalog(), served());
    assert.equal(report.equal, true, formatReport(report));
    assert.deepEqual(served().map((e) => e.tmdb).sort((a, b) => a - b), [550, 1396]);
    const ids = linkIds("movie", 550);
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
    assert.deepEqual(served().find((e) => e.tmdb === 550).links.map((l) => l.link), [link(1), link(4), link(2)]);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM links").get().n, 4);
  });

  test("moves a link to another title", async () => {
    await runImport();
    write("movies", 550, { links: [{ quality: "1080p", link: link(1) }] });
    write("movies", 680, { links: [{ quality: "1080p", link: link(3) }, { quality: "4K", link: link(2) }] });
    await runImport(NOW + 60_000);
    const report = compareCatalogs(await expectedCatalog(), served());
    assert.equal(report.equal, true, formatReport(report));
  });

  test("the files win over what was written through the API", async () => {
    await runImport();
    db.sqlite.prepare(
      "INSERT INTO links (type, tmdb_id, quality, url, link_key, added_by, created_at, updated_at) VALUES ('movie', 550, '4K', ?, ?, 7, 1, 1)"
    ).run(link(99), link(99));
    db.sqlite.prepare("UPDATE links SET quality = '4K' WHERE url = ?").run(link(1));
    await runImport(NOW + 60_000);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM links WHERE url = ?").get(link(99)).n, 0);
    const report = compareCatalogs(await expectedCatalog(), served());
    assert.equal(report.equal, true, formatReport(report));
  });

  test("refuses a Telegram message claimed by two files", async () => {
    write("movies", 680, { links: [{ quality: "1080p", link: link(1) }] });
    await assert.rejects(runImport(), /is a link of both/);
  });
});

describe("compareCatalogs", () => {
  const entry = (tmdb, extra = {}) => ({ type: "movie", tmdb, title: `t${tmdb}`, qualities: ["1080p", "4K"], links: [], ...extra });

  test("reports titles on one side only and the fields that differ", () => {
    const report = compareCatalogs([entry(1), entry(2), entry(3)], [entry(1, { title: "other" }), entry(3), entry(4)]);
    assert.deepEqual(report.missing, ["movie:2"]);
    assert.deepEqual(report.extra, ["movie:4"]);
    assert.deepEqual(report.changed, [{ key: "movie:1", fields: ["title"] }]);
    assert.equal(report.equal, false);
  });

  test("ignores the order of qualities but notes a different title order", () => {
    const report = compareCatalogs([entry(1), entry(2)], [entry(2, { qualities: ["4K", "1080p"] }), entry(1)]);
    assert.equal(report.equal, true);
    assert.equal(report.sameOrder, false);
    assert.match(formatReport(report), /different order/);
  });
});
