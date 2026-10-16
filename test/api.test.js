import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import worker from "../tools/cositalogo-api/src/worker.js";
import { clearCatalogMemo, refreshTitle, titleEntry } from "../tools/cositalogo-api/src/catalog.js";
import { clearSettingsCache } from "../tools/cositalogo-api/src/settings.js";
import { signSession } from "../tools/cositalogo-api/src/session.js";
import { createD1 } from "./d1-shim.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const SECRET = "test-session-secret";
const GENERAL = "2229558644";
const COMUNIDAD = "2142474284";
const SETTINGS = {
  qualities: ["1080p", "4K"],
  groups: { [GENERAL]: "General", [COMUNIDAD]: "Comunidad" },
  languages: { audio: ["Castellano", "Latino", "Inglés", "Japonés"], subs: ["Castellano", "Inglés", "Forzados"] },
};

const TMDB = {
  "/movie/603": {
    id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30", poster_path: "/matrix.jpg",
    backdrop_path: "/matrix-bg.jpg", imdb_id: "tt0133093", genres: [{ name: "Acción" }, { name: "Ciencia ficción" }],
    overview: "Neo.", tagline: "", vote_average: 8.2, runtime: 136,
    translations: { translations: [{ iso_639_1: "en", iso_3166_1: "US", data: { title: "The Matrix" } }, { iso_639_1: "fr", data: { title: "Matrix" } }] },
  },
  "/movie/129": {
    id: 129, title: "El viaje de Chihiro", original_title: "千と千尋の神隠し", release_date: "2001-07-20", poster_path: "/chihiro.jpg",
    imdb_id: "tt0245429", genres: [{ name: "Animación" }], overview: "", vote_average: 8.5, runtime: 125,
    translations: { translations: [{ iso_639_1: "en", iso_3166_1: "US", data: { title: "Spirited Away" } }] },
  },
  "/tv/1399": {
    id: 1399, name: "Juego de tronos", original_name: "Game of Thrones", first_air_date: "2011-04-17", poster_path: "/got.jpg",
    genres: [{ name: "Drama" }], overview: "Invierno.", number_of_seasons: 8, vote_average: 8.4,
    external_ids: { imdb_id: "tt0944947" },
    translations: { translations: [{ iso_639_1: "en", iso_3166_1: "US", data: { name: "Game of Thrones" } }] },
  },
  "/tv/1399/season/1": { name: "Temporada 1", poster_path: "/got-s1.jpg", air_date: "2011-04-17", episodes: new Array(10).fill({}) },
};

let env;
let tmdbCalls;
let originalFetch;
let originalConsoleError;

beforeEach(() => {
  env = { DB: createD1(MIGRATIONS), SESSION_SECRET: SECRET, TMDB_API_KEY: "dummy-key" };
  for (const [key, value] of Object.entries(SETTINGS)) {
    env.DB.sqlite.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value));
  }
  for (const uid of [1, 2, 7, 9, 42]) {
    env.DB.sqlite.prepare("INSERT INTO members (user_id, name, created_at) VALUES (?, ?, 0)").run(uid, `user ${uid}`);
  }
  clearCatalogMemo();
  clearSettingsCache();
  tmdbCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/3/, "");
    tmdbCalls.push(path);
    if (url.hostname !== "api.themoviedb.org") throw new Error(`unexpected fetch ${url}`);
    if (path === "/movie/500") return new Response("{}", { status: 500 });
    const body = TMDB[path];
    return body ? Response.json(body) : new Response("{}", { status: 404 });
  };
  originalConsoleError = console.error;
  console.error = process.env.SHOW_ERRORS ? originalConsoleError : () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

async function cookieFor(uid, { exp = Date.now() + 3600e3, secret = SECRET } = {}) {
  return `s=${await signSession({ uid, name: `user ${uid}`, exp }, secret)}`;
}

async function call(method, path, { body, uid, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] ??= "application/json";
  if (uid !== undefined) h.cookie = await cookieFor(uid);
  if (cookie !== undefined) h.cookie = cookie;
  const req = new Request(`https://cositalogo.test${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return worker.fetch(req, env);
}

async function catalog() {
  const res = await call("GET", "/api/catalog");
  assert.equal(res.status, 200);
  return res.json();
}

const movieLink = (overrides = {}) => ({
  type: "movie", tmdb: 603, quality: "1080p", audio: ["Castellano"], subs: [], link: `https://t.me/c/${GENERAL}/2/100`, ...overrides,
});

const auditRows = () => env.DB.sqlite.prepare("SELECT * FROM audit ORDER BY id").all();

describe("GET /api/catalog", () => {
  test("starts empty with an ETag and answers 304 when it has not changed", async () => {
    const res = await call("GET", "/api/catalog");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
    const etag = res.headers.get("etag");
    assert.equal(res.headers.get("cache-control"), "no-cache");
    const again = await call("GET", "/api/catalog", { headers: { "if-none-match": etag } });
    assert.equal(again.status, 304);
  });

  test("changes its ETag after every write, even within the same millisecond", async () => {
    const first = (await call("GET", "/api/catalog")).headers.get("etag");
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    const second = (await call("GET", "/api/catalog")).headers.get("etag");
    await call("POST", "/api/links", { uid: 1, body: movieLink({ quality: "4K", link: `https://t.me/c/${GENERAL}/2/101` }) });
    const third = (await call("GET", "/api/catalog")).headers.get("etag");
    assert.notEqual(first, second);
    assert.notEqual(second, third);
    const stale = await call("GET", "/api/catalog", { headers: { "if-none-match": second } });
    assert.equal(stale.status, 200);
  });

  test("lists the newest title first", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    await new Promise((r) => setTimeout(r, 2));
    await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129, link: `https://t.me/c/${GENERAL}/2/200` }) });
    assert.deepEqual((await catalog()).map((t) => t.tmdb), [129, 603]);
  });
});

describe("POST /api/links", () => {
  test("creates the title from TMDB with every catalog field", async () => {
    const res = await call("POST", "/api/links", { uid: 7, body: movieLink() });
    assert.equal(res.status, 201);
    const link = await res.json();
    assert.equal(link.link, `https://t.me/c/${GENERAL}/2/100`);
    assert.deepEqual(tmdbCalls, ["/movie/603"]);
    assert.deepEqual(await catalog(), [{
      type: "movie", tmdb: 603, imdb: "tt0133093", title: "Matrix", originalTitle: "The Matrix", year: "1999",
      poster: "https://image.tmdb.org/t/p/w342/matrix.jpg", qualities: ["1080p"], genres: ["Acción", "Ciencia ficción"],
      links: [{ quality: "1080p", audio: ["Castellano"], subs: [], tags: [], group: "General", link: `https://t.me/c/${GENERAL}/2/100` }],
    }]);
  });

  test("adds englishTitle only when it differs from the other titles", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129 }) });
    const [entry] = await catalog();
    assert.equal(entry.englishTitle, "Spirited Away");
    assert.deepEqual(Object.keys(entry).slice(0, 7), ["type", "tmdb", "imdb", "title", "originalTitle", "englishTitle", "year"]);
  });

  test("reuses the stored title instead of asking TMDB again, and orders qualities by settings", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink({ quality: "4K" }) });
    await call("POST", "/api/links", { uid: 1, body: movieLink({ link: `https://t.me/c/${COMUNIDAD}/9` }) });
    assert.deepEqual(tmdbCalls, ["/movie/603"]);
    const [entry] = await catalog();
    assert.deepEqual(entry.qualities, ["1080p", "4K"]);
    assert.deepEqual(entry.links.map((l) => l.group), ["General", "Comunidad"]);
  });

  test("records who added it in the audit log, in the same transaction", async () => {
    const link = await (await call("POST", "/api/links", { uid: 42, body: movieLink() })).json();
    const rows = auditRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, 42);
    assert.equal(rows[0].action, "add");
    assert.equal(rows[0].target, `link:${link.id}`);
    assert.equal(rows[0].before, null);
    assert.equal(JSON.parse(rows[0].after).quality, "1080p");
  });

  test("sets a manual poster when the add creates the title, logged in the same transaction", async () => {
    const poster = "https://image.tmdb.org/t/p/w342/other.jpg";
    const res = await call("POST", "/api/links", { uid: 7, body: movieLink({ poster }) });
    assert.equal(res.status, 201);
    assert.equal((await catalog())[0].poster, poster);
    const rows = auditRows();
    assert.deepEqual(rows.map((r) => [r.action, r.target]), [["poster", "movie:603"], ["add", `link:${(await res.json()).id}`]]);
    assert.equal(JSON.parse(rows[0].after), poster);
  });

  test("refuses a poster for a title that already exists, or one that is not https, writing nothing", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    const again = await call("POST", "/api/links", { uid: 1, body: movieLink({ link: `https://t.me/c/${COMUNIDAD}/9`, poster: "https://x.test/a.jpg" }) });
    assert.equal(again.status, 409);
    const bad = await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129, link: `https://t.me/c/${COMUNIDAD}/10`, poster: "http://x.test/a.jpg" }) });
    assert.equal(bad.status, 400);
    assert.equal((await catalog()).length, 1);
    assert.equal(auditRows().length, 1);
  });

  test("fills season names and posters for series, falling back when TMDB lacks the season", async () => {
    const base = { type: "series", tmdb: 1399, quality: "1080p" };
    await call("POST", "/api/links", { uid: 1, body: { ...base, season: 1, link: `https://t.me/c/${GENERAL}/4/1` } });
    await call("POST", "/api/links", { uid: 1, body: { ...base, season: 9, link: `https://t.me/c/${GENERAL}/4/2` } });
    await call("POST", "/api/links", { uid: 1, body: { ...base, season: "all", link: `https://t.me/c/${GENERAL}/4/3` } });
    const [entry] = await catalog();
    assert.equal(entry.imdb, "tt0944947");
    assert.equal(entry.englishTitle, undefined);
    assert.deepEqual(entry.links.map((l) => [l.season, l.seasonName, l.seasonPoster]), [
      [1, "Temporada 1", "https://image.tmdb.org/t/p/w342/got-s1.jpg"],
      [9, "Temporada 9", "https://image.tmdb.org/t/p/w342/got.jpg"],
      ["all", "Serie completa", "https://image.tmdb.org/t/p/w342/got.jpg"],
    ]);
    assert.deepEqual(Object.keys(entry.links[0]).slice(0, 4), ["season", "seasonName", "seasonPoster", "quality"]);
    const detail = await (await call("GET", "/api/titles/series/1399")).json();
    assert.deepEqual(detail.detail.seasons, { 1: { episodeCount: 10, airDate: "2011-04-17" } });
  });

  for (const [name, body, message] of [
    ["an unknown quality", movieLink({ quality: "720p" }), /quality/],
    ["an unknown language", movieLink({ audio: ["Klingon"] }), /audio/],
    ["an unknown group", movieLink({ link: "https://t.me/c/1234/5" }), /unknown telegram group/],
    ["an invite link", movieLink({ link: "https://t.me/+abc" }), /invite/],
    ["a season on a movie", movieLink({ season: 1 }), /season is not allowed/],
    ["a series without season", { ...movieLink(), type: "series", tmdb: 1399 }, /season is required/],
    ["a bad type", movieLink({ type: "book" }), /type/],
    ["a bad tmdb id", movieLink({ tmdb: -3 }), /tmdb/],
  ]) {
    test(`rejects ${name} with 400 and writes nothing`, async () => {
      const res = await call("POST", "/api/links", { uid: 1, body });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, message);
      assert.deepEqual(await catalog(), []);
      assert.deepEqual(tmdbCalls, []);
    });
  }

  test("rejects the same Telegram message twice, even under another topic", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    const res = await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129, link: `https://t.me/c/${GENERAL}/100` }) });
    assert.equal(res.status, 409);
    assert.deepEqual((await catalog()).map((t) => t.tmdb), [603]);
  });

  test("answers 422 for an id TMDB does not know and 502 when TMDB fails, writing nothing", async () => {
    assert.equal((await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 404404 }) })).status, 422);
    assert.equal((await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 500 }) })).status, 502);
    assert.deepEqual(await catalog(), []);
    assert.equal(auditRows().length, 0);
  });

  test("answers 503 while the settings are not configured", async () => {
    env.DB.sqlite.exec("DELETE FROM settings WHERE key = 'groups'");
    const res = await call("POST", "/api/links", { uid: 1, body: movieLink() });
    assert.equal(res.status, 503);
  });
});

describe("authentication", () => {
  test("refuses writes without a session", async () => {
    assert.equal((await call("POST", "/api/links", { body: movieLink() })).status, 401);
  });

  test("refuses a session signed with another secret, an expired one, or a tampered one", async () => {
    const other = await cookieFor(1, { secret: "other" });
    const expired = await cookieFor(1, { exp: Date.now() - 1 });
    const good = await cookieFor(1);
    const [body, mac] = good.slice(2).split(".");
    const forged = `s=${Buffer.from(JSON.stringify({ uid: 2, exp: Date.now() + 1e6 })).toString("base64url")}.${mac}`;
    for (const cookie of [other, expired, forged, `s=${body}`, "s="]) {
      assert.equal((await call("POST", "/api/links", { body: movieLink(), cookie })).status, 401, cookie);
    }
  });

  test("fails closed when the session secret is missing", async () => {
    const cookie = await cookieFor(1);
    delete env.SESSION_SECRET;
    assert.equal((await call("POST", "/api/links", { body: movieLink(), cookie })).status, 401);
  });

  test("only accepts JSON bodies, so a cross-site form cannot post", async () => {
    const res = await call("POST", "/api/links", { uid: 1, body: "type=movie", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assert.equal(res.status, 415);
    assert.equal((await call("POST", "/api/links", { uid: 1, body: "[1]" })).status, 400);
  });
});

describe("PATCH /api/links/:id", () => {
  test("edits a link and keeps the previous value in the audit log", async () => {
    const { id } = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129, link: `https://t.me/c/${GENERAL}/2/200` }) });
    const res = await call("PATCH", `/api/links/${id}`, { uid: 2, body: { quality: "4K", subs: ["Inglés"] } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).quality, "4K");
    const [chihiro, entry] = await catalog();
    assert.deepEqual(entry.qualities, ["4K"]);
    assert.deepEqual(entry.links[0].subs, ["Inglés"]);
    assert.deepEqual(chihiro.links.map((l) => [l.quality, l.subs, l.link]), [["1080p", [], `https://t.me/c/${GENERAL}/2/200`]]);
    const update = auditRows().at(-1);
    assert.equal(update.action, "update");
    assert.equal(update.user_id, 2);
    assert.equal(JSON.parse(update.before).quality, "1080p");
    assert.equal(JSON.parse(update.after).quality, "4K");
  });

  test("validates the merged link and refuses a message already used elsewhere", async () => {
    const a = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    await call("POST", "/api/links", { uid: 1, body: movieLink({ link: `https://t.me/c/${GENERAL}/2/101` }) });
    assert.equal((await call("PATCH", `/api/links/${a.id}`, { uid: 1, body: { quality: "8K" } })).status, 400);
    assert.equal((await call("PATCH", `/api/links/${a.id}`, { uid: 1, body: { link: `https://t.me/c/${GENERAL}/101` } })).status, 409);
    assert.equal((await call("PATCH", "/api/links/999", { uid: 1, body: { quality: "4K" } })).status, 404);
  });
});

describe("DELETE /api/links/:id", () => {
  test("lets the author or an admin delete, but not another member", async () => {
    const { id } = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    await call("POST", "/api/links", { uid: 1, body: movieLink({ link: `https://t.me/c/${GENERAL}/2/101` }) });
    assert.equal((await call("DELETE", `/api/links/${id}`, { uid: 2 })).status, 403);
    assert.equal((await call("DELETE", `/api/links/${id}`, { uid: 1 })).status, 204);
    env.DB.sqlite.prepare("INSERT INTO admins (user_id, created_at) VALUES (9, 0)").run();
    const [{ links }] = await catalog();
    assert.equal(links.length, 1);
    const other = env.DB.sqlite.prepare("SELECT id FROM links").get().id;
    assert.equal((await call("DELETE", `/api/links/${other}`, { uid: 9 })).status, 204);
  });

  test("drops the title with its last link and logs the deleted link", async () => {
    const { id } = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    await call("DELETE", `/api/links/${id}`, { uid: 1 });
    assert.deepEqual(await catalog(), []);
    assert.equal((await call("GET", "/api/titles/movie/603")).status, 404);
    const del = auditRows().at(-1);
    assert.equal(del.action, "delete");
    assert.equal(JSON.parse(del.before).link, `https://t.me/c/${GENERAL}/2/100`);
  });
});

describe("POST /api/links/:id/move", () => {
  test("moves a link to another title, fetching it, and drops the emptied one", async () => {
    const { id } = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    const res = await call("POST", `/api/links/${id}/move`, { uid: 1, body: { type: "series", tmdb: 1399, season: 1 } });
    assert.equal(res.status, 200);
    const cat = await catalog();
    assert.deepEqual(cat.map((t) => `${t.type}:${t.tmdb}`), ["series:1399"]);
    assert.equal(cat[0].links[0].season, 1);
    assert.equal(cat[0].links[0].seasonName, "Temporada 1");
    assert.equal(auditRows().at(-1).action, "move");
  });

  test("needs a season when moving to a series and is limited to the author or an admin", async () => {
    const { id } = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    assert.equal((await call("POST", `/api/links/${id}/move`, { uid: 1, body: { type: "series", tmdb: 1399 } })).status, 400);
    assert.equal((await call("POST", `/api/links/${id}/move`, { uid: 2, body: { type: "movie", tmdb: 129 } })).status, 403);
  });
});

describe("PUT /api/titles/:type/:id/poster", () => {
  test("sets and clears the manual poster of a title and of a season", async () => {
    await call("POST", "/api/links", { uid: 1, body: { type: "series", tmdb: 1399, season: 1, quality: "1080p", link: `https://t.me/c/${GENERAL}/4/1` } });
    const put = (body) => call("PUT", "/api/titles/series/1399/poster", { uid: 1, body });
    assert.equal((await put({ poster: "https://example.com/p.jpg" })).status, 204);
    assert.equal((await put({ poster: "https://example.com/s1.jpg", season: 1 })).status, 204);
    let [entry] = await catalog();
    assert.equal(entry.poster, "https://example.com/p.jpg");
    assert.equal(entry.links[0].seasonPoster, "https://example.com/s1.jpg");
    await put({ poster: null, season: 1 });
    await put({ poster: null });
    [entry] = await catalog();
    assert.equal(entry.poster, "https://image.tmdb.org/t/p/w342/got.jpg");
    assert.equal(entry.links[0].seasonPoster, "https://image.tmdb.org/t/p/w342/got-s1.jpg");
    assert.deepEqual(auditRows().filter((r) => r.action === "poster").map((r) => r.target), ["series:1399", "series:1399:1", "series:1399:1", "series:1399"]);
  });

  test("rejects a non-https poster, a season on a movie and unknown titles", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    assert.equal((await call("PUT", "/api/titles/movie/603/poster", { uid: 1, body: { poster: "http://x.test/a.jpg" } })).status, 400);
    assert.equal((await call("PUT", "/api/titles/movie/603/poster", { uid: 1, body: { poster: "https://x.test/a.jpg", season: 1 } })).status, 400);
    assert.equal((await call("PUT", "/api/titles/movie/129/poster", { uid: 1, body: { poster: "https://x.test/a.jpg" } })).status, 404);
  });
});

describe("routing and consistency", () => {
  test("answers 404 for unknown paths and 405 for a wrong method", async () => {
    assert.equal((await call("GET", "/api/nope")).status, 404);
    assert.equal((await call("PUT", "/api/catalog")).status, 405);
  });

  test("GET /api/titles returns the catalog entry and the detail", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    const { entry, detail } = await (await call("GET", "/api/titles/movie/603")).json();
    assert.equal(entry.title, "Matrix");
    assert.deepEqual(detail, {
      overview: "Neo.", tagline: "", genres: ["Acción", "Ciencia ficción"], backdrop: "https://image.tmdb.org/t/p/w780/matrix-bg.jpg",
      voteAverage: 8.2, runtime: 136,
    });
  });

  test("a fragment refresh retries instead of storing a stale entry when links change underneath", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    const db = env.DB;
    let sneaked = false;
    const realBatch = db.batch;
    db.batch = async (stmts) => {
      if (!sneaked && /^UPDATE titles SET json/.test(stmts[0].sql)) {
        sneaked = true;
        db.sqlite.prepare(
          "INSERT INTO links (type, tmdb_id, quality, url, link_key, created_at, updated_at) VALUES ('movie', 603, '4K', ?, ?, 1, 1)"
        ).run(`https://t.me/c/${GENERAL}/2/555`, `https://t.me/c/${GENERAL}/555`);
      }
      return realBatch(stmts);
    };
    await refreshTitle(db, "movie", 603, SETTINGS);
    const [entry] = await catalog();
    assert.deepEqual(entry.qualities, ["1080p", "4K"]);
  });

  test("the snapshot SQLite builds equals joining the fragments", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    await call("POST", "/api/links", { uid: 1, body: movieLink({ tmdb: 129, link: `https://t.me/c/${GENERAL}/2/200` }) });
    const rows = env.DB.sqlite.prepare("SELECT * FROM titles ORDER BY created_at DESC, type, tmdb_id").all();
    const links = env.DB.sqlite.prepare("SELECT * FROM links ORDER BY id").all();
    const expected = rows.map((t) => titleEntry(t, links.filter((l) => l.tmdb_id === t.tmdb_id && l.type === t.type), SETTINGS));
    assert.deepEqual(await catalog(), expected);
  });
});

describe("GET /api/settings", () => {
  test("lists qualities, groups and languages to anyone", async () => {
    env.DB.sqlite.prepare("INSERT INTO settings (key, value) VALUES ('other', '1')").run();
    const res = await call("GET", "/api/settings");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), SETTINGS);
  });

  test("answers 503 while any of them is missing", async () => {
    env.DB.sqlite.exec("DELETE FROM settings WHERE key = 'languages'");
    assert.equal((await call("GET", "/api/settings")).status, 503);
  });
});

describe("GET /api/titles/:type/:id/links", () => {
  test("needs a session", async () => {
    await call("POST", "/api/links", { uid: 1, body: movieLink() });
    assert.equal((await call("GET", "/api/titles/movie/603/links")).status, 401);
  });

  test("lists the links with their ids in catalog order and says which ones the user can delete", async () => {
    const first = await (await call("POST", "/api/links", { uid: 1, body: movieLink() })).json();
    const second = await (await call("POST", "/api/links", { uid: 2, body: movieLink({ quality: "4K", link: `https://t.me/c/${GENERAL}/2/101` }) })).json();
    const res = await call("GET", "/api/titles/movie/603/links", { uid: 1 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ ...first, canDelete: true }, { ...second, canDelete: false }]);
    const [entry] = await catalog();
    assert.deepEqual(entry.links.map((l) => l.link), [first.link, second.link]);
    env.DB.sqlite.prepare("INSERT INTO admins (user_id, created_at) VALUES (9, 0)").run();
    const asAdmin = await (await call("GET", "/api/titles/movie/603/links", { uid: 9 })).json();
    assert.deepEqual(asAdmin.map((l) => l.canDelete), [true, true]);
  });

  test("answers 404 for a title with no links", async () => {
    assert.equal((await call("GET", "/api/titles/series/1399/links", { uid: 1 })).status, 404);
  });
});

describe("concurrent writes", () => {
  test("two first links for the same new title both land", async () => {
    const results = await Promise.all([
      call("POST", "/api/links", { uid: 1, body: movieLink() }),
      call("POST", "/api/links", { uid: 2, body: movieLink({ quality: "4K", link: `https://t.me/c/${GENERAL}/2/101` }) }),
    ]);
    assert.deepEqual(results.map((r) => r.status), [201, 201]);
    const [entry] = await catalog();
    assert.deepEqual(entry.qualities, ["1080p", "4K"]);
  });
});

describe("audit log and undo", () => {
  const ADMIN = 9;
  beforeEach(() => {
    env.DB.sqlite.prepare("INSERT INTO admins (user_id, name, created_at) VALUES (?, 'Jefa', 0)").run(ADMIN);
  });
  const add = async (body = movieLink(), uid = 7) => (await call("POST", "/api/links", { uid, body })).json();
  const undo = (id, uid = ADMIN) => call("POST", `/api/audit/${id}/undo`, { uid, body: {} });
  const lastAudit = () => auditRows().at(-1);
  const linkRow = (id) => env.DB.sqlite.prepare("SELECT * FROM links WHERE id = ?").get(id);

  test("GET /api/audit is for admins, newest first, with names, pages and a title filter", async () => {
    await add();
    await add(movieLink({ tmdb: 129, link: `https://t.me/c/${GENERAL}/2/200` }), 1);
    assert.equal((await call("GET", "/api/audit")).status, 401);
    assert.equal((await call("GET", "/api/audit", { uid: 7 })).status, 403);
    const page = await (await call("GET", "/api/audit?limit=1", { uid: ADMIN })).json();
    assert.equal(page.more, true);
    assert.equal(page.entries.length, 1);
    const [newest] = page.entries;
    assert.deepEqual({ ...newest, at: 0 }, {
      id: 2, at: 0, user: { id: 1, name: "user 1" }, action: "add", target: `link:${newest.target.slice(5)}`, before: null,
      after: { type: "movie", tmdb: 129, quality: "1080p", audio: ["Castellano"], subs: [], tags: [], link: `https://t.me/c/${GENERAL}/2/200` },
      reverts: null, undoneBy: null,
    });
    const next = await (await call("GET", "/api/audit?before=2", { uid: ADMIN })).json();
    assert.deepEqual(next.entries.map((e) => e.id), [1]);
    assert.equal(next.more, false);
    const only = await (await call("GET", "/api/audit?title=movie:603", { uid: ADMIN })).json();
    assert.deepEqual(only.entries.map((e) => e.after.tmdb), [603]);
    assert.equal((await call("GET", "/api/audit?title=x", { uid: ADMIN })).status, 400);
  });

  test("undoing an add deletes the link, once, and the row says who undid it", async () => {
    const link = await add();
    const res = await undo(1);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: 2 });
    assert.deepEqual(await catalog(), []);
    assert.equal(lastAudit().action, "delete");
    assert.equal(lastAudit().reverts, 1);
    assert.equal((await undo(1)).status, 409);
    const [entry] = (await (await call("GET", "/api/audit?before=2", { uid: ADMIN })).json()).entries;
    assert.equal(entry.undoneBy, 2);
    assert.equal(linkRow(link.id), undefined);
  });

  test("undoing an undo redoes the write, back in its place", async () => {
    const link = await add();
    const before = await catalog();
    await undo(1);
    assert.equal((await undo(2)).status, 200);
    assert.deepEqual(await catalog(), before);
    assert.equal(linkRow(link.id).added_by, 7);
    assert.equal(lastAudit().reverts, 2);
  });

  test("undoing an edit only works while the link is as the edit left it", async () => {
    const link = await add();
    const original = await catalog();
    await call("PATCH", `/api/links/${link.id}`, { uid: 1, body: { quality: "4K" } });
    await call("PATCH", `/api/links/${link.id}`, { uid: 2, body: { tags: ["HDR"] } });
    const late = await undo(2);
    assert.equal(late.status, 409);
    assert.match((await late.json()).error, /changed after/);
    assert.equal((await undo(3)).status, 200);
    assert.equal((await undo(2)).status, 200);
    assert.deepEqual(await catalog(), original);
  });

  test("undoing a move puts the link back, bringing back the emptied title", async () => {
    const link = await add();
    const original = await catalog();
    await call("POST", `/api/links/${link.id}/move`, { uid: 7, body: { type: "movie", tmdb: 129 } });
    assert.deepEqual((await catalog()).map((t) => t.tmdb), [129]);
    assert.equal((await undo(2)).status, 200);
    assert.equal(lastAudit().action, "move");
    assert.deepEqual((await catalog()).map((t) => t.tmdb), [603]);
    assert.deepEqual((await catalog())[0].links, original[0].links);
  });

  test("undoing a delete restores the same link with its id and author, or refuses if its message is used again", async () => {
    const first = await add();
    await add(movieLink({ quality: "4K", link: `https://t.me/c/${GENERAL}/2/101` }), 1);
    const original = await catalog();
    const createdAt = linkRow(first.id).created_at;
    await call("DELETE", `/api/links/${first.id}`, { uid: 7 });
    const deleted = lastAudit();
    assert.equal(JSON.parse(deleted.before).addedBy, 7);
    assert.equal((await undo(deleted.id)).status, 200);
    assert.deepEqual(await catalog(), original);
    assert.equal(linkRow(first.id).added_by, 7);
    assert.equal(linkRow(first.id).created_at, createdAt);

    await call("DELETE", `/api/links/${first.id}`, { uid: ADMIN });
    const again = lastAudit().id;
    await add(movieLink({ tmdb: 129 }), 2);
    assert.equal((await undo(again)).status, 409);
  });

  test("undoing an old-format delete takes the author from the add", async () => {
    const link = await add();
    env.DB.sqlite.prepare("DELETE FROM links WHERE id = ?").run(link.id);
    env.DB.sqlite.prepare("INSERT INTO audit (at, user_id, action, target, before) VALUES (1, 9, 'delete', ?, ?)")
      .run(`link:${link.id}`, JSON.stringify({ id: link.id, type: "movie", tmdb: 603, quality: "1080p", audio: ["Castellano"], subs: [], tags: [], link: link.link }));
    assert.equal((await undo(lastAudit().id)).status, 200);
    assert.equal(linkRow(link.id).added_by, 7);
  });

  test("undoing a poster change brings the previous one back while nobody changed it since", async () => {
    await add(movieLink({ poster: "https://x.test/a.jpg" }));
    await call("PUT", "/api/titles/movie/603/poster", { uid: 1, body: { poster: "https://x.test/b.jpg" } });
    await call("PUT", "/api/titles/movie/603/poster", { uid: 1, body: { poster: "https://x.test/c.jpg" } });
    const posters = auditRows().filter((r) => r.action === "poster").map((r) => r.id);
    assert.equal((await undo(posters[1])).status, 409);
    assert.equal((await undo(posters[2])).status, 200);
    assert.equal((await catalog())[0].poster, "https://x.test/b.jpg");
    assert.equal((await undo(posters[1])).status, 200);
    assert.equal((await undo(posters[0])).status, 200);
    assert.equal((await catalog())[0].poster, "https://image.tmdb.org/t/p/w342/matrix.jpg");
  });

  test("refuses other actions, members, unknown rows and non-JSON requests", async () => {
    env.DB.sqlite.prepare("INSERT INTO audit (at, user_id, action, target) VALUES (1, 9, 'grant', 'member:5')").run();
    assert.equal((await undo(lastAudit().id)).status, 400);
    await add();
    const id = lastAudit().id;
    assert.equal((await undo(id, 7)).status, 403);
    assert.equal((await undo(999)).status, 404);
    assert.equal((await call("POST", `/api/audit/${id}/undo`, { uid: ADMIN })).status, 415);
  });
});
