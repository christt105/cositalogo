import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import worker from "../tools/cositalogo-api/src/worker.js";
import { clearCatalogMemo } from "../tools/cositalogo-api/src/catalog.js";
import { listRequests } from "../tools/cositalogo-api/src/requests.js";
import { clearSettingsCache } from "../tools/cositalogo-api/src/settings.js";
import { signSession } from "../tools/cositalogo-api/src/session.js";
import { createD1 } from "./d1-shim.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const SECRET = "test-session-secret";
const GENERAL = "2229558644";
const SETTINGS = {
  qualities: ["1080p", "4K"],
  groups: { [GENERAL]: "General" },
  languages: { audio: ["Castellano", "Inglés"], subs: ["Castellano"] },
};

const TMDB = {
  "/movie/603": {
    id: 603, title: "Matrix", original_title: "The Matrix", release_date: "1999-03-30", poster_path: "/matrix.jpg",
    imdb_id: "tt0133093", genres: [], overview: "", vote_average: 8.2, runtime: 136, translations: { translations: [] },
  },
  "/tv/1399": {
    id: 1399, name: "Juego de tronos", original_name: "Game of Thrones", first_air_date: "2011-04-17", poster_path: "/got.jpg",
    genres: [], overview: "", number_of_seasons: 8, vote_average: 8.4, external_ids: { imdb_id: "tt0944947" }, translations: { translations: [] },
  },
  "/tv/1399/season/2": { name: "Temporada 2", poster_path: "/got-s2.jpg", air_date: "2012-04-01", episodes: new Array(10).fill({}) },
  "/tv/1399/season/3": { name: "Temporada 3", poster_path: null, air_date: "2013-03-31", episodes: [] },
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
  for (const uid of [1, 2, 3]) {
    env.DB.sqlite.prepare("INSERT INTO members (user_id, name, created_at) VALUES (?, ?, 0)").run(uid, `user ${uid}`);
  }
  env.DB.sqlite.prepare("INSERT INTO admins (user_id, name, created_at) VALUES (9, 'admin', 0)").run();
  clearCatalogMemo();
  clearSettingsCache();
  tmdbCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const path = url.pathname.replace(/^\/3/, "");
    tmdbCalls.push(path);
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

async function call(method, path, { body, uid } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (uid !== undefined) headers.cookie = `s=${await signSession({ uid, name: `user ${uid}`, exp: Date.now() + 3600e3 }, SECRET)}`;
  return worker.fetch(new Request(`https://cositalogo.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
}

async function ask(uid, body) {
  const res = await call("POST", "/api/requests", { uid, body });
  return { status: res.status, body: await res.json() };
}

async function list(uid) {
  const res = await call("GET", "/api/requests", { uid });
  assert.equal(res.status, 200);
  return res.json();
}

const addLink = (body) => call("POST", "/api/links", {
  uid: 1,
  body: { quality: "1080p", audio: ["Castellano"], subs: [], link: `https://t.me/c/${GENERAL}/2/${100 + Math.floor(Math.random() * 1e6)}`, ...body },
});

describe("access", () => {
  test("needs a session to read and to be a member to read or write", async () => {
    assert.equal((await call("GET", "/api/requests")).status, 401);
    env.DB.sqlite.prepare("DELETE FROM members WHERE user_id = 3").run();
    assert.equal((await call("GET", "/api/requests", { uid: 3 })).status, 403);
    assert.equal((await call("POST", "/api/requests", { uid: 3, body: { type: "movie", tmdb: 603 } })).status, 403);
  });

  test("lists with no-store so a vote shows up at once", async () => {
    const res = await call("GET", "/api/requests", { uid: 1 });
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), []);
  });
});

describe("POST /api/requests", () => {
  test("creates a movie request from TMDB with its author's vote", async () => {
    const { status, body } = await ask(1, { type: "movie", tmdb: 603, note: "  en  VOSE\n " });
    assert.equal(status, 201);
    assert.equal(body.title, "Matrix");
    assert.equal(body.year, "1999");
    assert.equal(body.poster, "https://image.tmdb.org/t/p/w342/matrix.jpg");
    assert.equal(body.note, "en VOSE");
    assert.equal("season" in body, false);
    assert.deepEqual(body.requestedBy, { id: 1, name: "user 1" });
    assert.equal(body.votes, 1);
    assert.equal(body.voted, true);
    assert.equal(body.canDelete, true);
    assert.equal(body.fulfilledAt, null);
  });

  test("takes the season's name and poster, falling back to the series poster", async () => {
    const two = (await ask(1, { type: "series", tmdb: 1399, season: 2 })).body;
    assert.equal(two.season, 2);
    assert.equal(two.seasonName, "Temporada 2");
    assert.equal(two.poster, "https://image.tmdb.org/t/p/w342/got-s2.jpg");
    const three = (await ask(1, { type: "series", tmdb: 1399, season: 3 })).body;
    assert.equal(three.poster, "https://image.tmdb.org/t/p/w342/got.jpg");
  });

  test("adds a vote to the same open request instead of repeating it, without asking TMDB again", async () => {
    const first = (await ask(1, { type: "series", tmdb: 1399, season: 2 })).body;
    tmdbCalls = [];
    const again = await ask(2, { type: "series", tmdb: 1399, season: 2, note: "ignored" });
    assert.equal(again.status, 200);
    assert.equal(again.body.id, first.id);
    assert.equal(again.body.votes, 2);
    assert.equal(again.body.voted, true);
    assert.equal(again.body.canDelete, false);
    assert.equal(again.body.note, "");
    assert.deepEqual(tmdbCalls, []);
    const whole = await ask(2, { type: "series", tmdb: 1399 });
    assert.equal(whole.status, 201);
    assert.equal((await list(3)).length, 2);
  });

  test("rejects bad input", async () => {
    assert.equal((await ask(1, { type: "book", tmdb: 1 })).status, 400);
    assert.equal((await ask(1, { type: "movie", tmdb: 603, season: 1 })).status, 400);
    assert.equal((await ask(1, { type: "series", tmdb: 1399, season: "2" })).status, 400);
    assert.equal((await ask(1, { type: "series", tmdb: 1399, season: -1 })).status, 400);
    assert.equal((await ask(1, { type: "movie", tmdb: 603, note: "x".repeat(201) })).status, 400);
    assert.equal((await ask(1, { type: "movie", tmdb: 603, note: 5 })).status, 400);
    assert.equal((await ask(1, { type: "movie", tmdb: 999 })).status, 422);
    assert.equal((await ask(1, { type: "series", tmdb: 1399, season: 40 })).status, 422);
    assert.equal((await list(1)).length, 0);
  });
});

describe("votes and deletes", () => {
  test("a member votes once and can take the vote back", async () => {
    const { id } = (await ask(1, { type: "movie", tmdb: 603 })).body;
    assert.equal((await call("PUT", `/api/requests/${id}/vote`, { uid: 2 })).status, 204);
    assert.equal((await call("PUT", `/api/requests/${id}/vote`, { uid: 2 })).status, 204);
    assert.equal((await list(2))[0].votes, 2);
    assert.equal((await call("DELETE", `/api/requests/${id}/vote`, { uid: 2 })).status, 204);
    const [after] = await list(2);
    assert.equal(after.votes, 1);
    assert.equal(after.voted, false);
    assert.equal((await call("PUT", "/api/requests/77/vote", { uid: 2 })).status, 404);
  });

  test("only the author or an admin deletes, and the votes go with it", async () => {
    const { id } = (await ask(1, { type: "movie", tmdb: 603 })).body;
    await call("PUT", `/api/requests/${id}/vote`, { uid: 2 });
    assert.equal((await call("DELETE", `/api/requests/${id}`, { uid: 2 })).status, 403);
    assert.equal((await call("DELETE", `/api/requests/${id}`, { uid: 9 })).status, 204);
    assert.equal((await list(1)).length, 0);
    assert.equal(env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM request_votes").get().n, 0);
    const own = (await ask(1, { type: "movie", tmdb: 603 })).body;
    assert.equal((await call("DELETE", `/api/requests/${own.id}`, { uid: 1 })).status, 204);
    assert.equal((await call("DELETE", `/api/requests/${own.id}`, { uid: 1 })).status, 404);
  });
});

describe("answered requests", () => {
  test("a link added afterwards answers a movie request; one added before does not", async () => {
    await addLink({ type: "movie", tmdb: 603 });
    await new Promise((r) => setTimeout(r, 2));
    const { id } = (await ask(1, { type: "movie", tmdb: 603 })).body;
    assert.equal((await list(1))[0].fulfilledAt, null);
    await new Promise((r) => setTimeout(r, 2));
    await addLink({ type: "movie", tmdb: 603, quality: "4K" });
    const [answered] = await list(1);
    assert.equal(answered.id, id);
    assert.equal(typeof answered.fulfilledAt, "number");
    const again = await ask(2, { type: "movie", tmdb: 603 });
    assert.equal(again.status, 201);
    assert.notEqual(again.body.id, id);
  });

  test("a season is answered by that season or by every season, a whole series by any link", async () => {
    const s2 = (await ask(1, { type: "series", tmdb: 1399, season: 2 })).body;
    const s3 = (await ask(1, { type: "series", tmdb: 1399, season: 3 })).body;
    const whole = (await ask(1, { type: "series", tmdb: 1399 })).body;
    await new Promise((r) => setTimeout(r, 2));
    await addLink({ type: "series", tmdb: 1399, season: 2 });
    const answered = new Map((await list(1)).map((r) => [r.id, r.fulfilledAt !== null]));
    assert.deepEqual([answered.get(s2.id), answered.get(s3.id), answered.get(whole.id)], [true, false, true]);
    await addLink({ type: "series", tmdb: 1399, season: "all" });
    assert.equal((await list(1)).every((r) => r.fulfilledAt !== null), true);
  });

  test("lists open requests by votes first, then answered ones, and drops those answered over 30 days ago", async () => {
    const movie = (await ask(1, { type: "movie", tmdb: 603 })).body;
    const series = (await ask(1, { type: "series", tmdb: 1399 })).body;
    await call("PUT", `/api/requests/${movie.id}/vote`, { uid: 2 });
    const season = (await ask(1, { type: "series", tmdb: 1399, season: 2 })).body;
    await new Promise((r) => setTimeout(r, 2));
    await addLink({ type: "series", tmdb: 1399, season: 2 });
    env.DB.sqlite.prepare("UPDATE requests SET created_at = 0 WHERE id = ?").run(series.id);
    assert.deepEqual((await list(1)).map((r) => r.id), [movie.id, season.id, series.id]);
    const later = Date.now() + 31 * 24 * 3600e3;
    const user = { id: 1, admin: false };
    assert.deepEqual((await listRequests(env.DB, user, later)).map((r) => r.id), [movie.id]);
  });
});
