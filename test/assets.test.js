import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import worker from "../tools/cositalogo-api/src/worker.js";

const INDEX = "<!doctype html><html></html>";

function makeEnv(files) {
  const requests = [];
  return {
    requests,
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        const { pathname } = new URL(request.url);
        if (request.headers.get("if-none-match") === `"${pathname}"`) return new Response(null, { status: 304 });
        const file = files[pathname];
        if (file) return new Response(file.body, { headers: { "content-type": file.type, etag: `"${pathname}"` } });
        return new Response(INDEX, { headers: { "content-type": "text/html; charset=utf-8" } });
      },
    },
  };
}

const env = () => makeEnv({ "/assets/index-abc.js": { body: "console.log(1)", type: "text/javascript" } });

function get(path, e, headers = {}) {
  return worker.fetch(new Request(`https://cositalogo.test${path}`, { headers }), e);
}

test("an existing hashed file is served with long-lived caching", async () => {
  const res = await get("/assets/index-abc.js", env());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/javascript");
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(await res.text(), "console.log(1)");
});

test("a revalidated hashed file keeps its 304", async () => {
  const res = await get("/assets/index-abc.js", env(), { "if-none-match": '"/assets/index-abc.js"' });
  assert.equal(res.status, 304);
  assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("a missing hashed file is an uncached JSON 404, never index.html", async () => {
  for (const headers of [{}, { "sec-fetch-mode": "navigate", accept: "text/html" }]) {
    const res = await get("/assets/nope.js", env(), headers);
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { error: "not found" });
  }
});

test("API paths never reach the assets binding", async () => {
  const e = env();
  const res = await get("/api/nope", e);
  assert.equal(res.status, 404);
  assert.equal(e.requests.length, 0);
});

test("/feed.xml is configured to reach the Worker before the single-page fallback", async () => {
  const toml = await readFile(new URL("../tools/cositalogo-api/wrangler.toml", import.meta.url), "utf8");
  const [, list] = /run_worker_first = \[(.*)\]/.exec(toml);
  assert.ok(list.includes('"/feed.xml"'));
});
