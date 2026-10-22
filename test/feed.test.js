import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import worker from "../tools/cositalogo-api/src/worker.js";
import { createD1 } from "./d1-shim.js";
import { link } from "./fixtures.js";

const MIGRATIONS = fileURLToPath(new URL("../tools/cositalogo-api/migrations", import.meta.url));
const DAY = 86400e3;
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0);

let env;
let nextLink;

beforeEach(() => {
  env = { DB: createD1(MIGRATIONS) };
  nextLink = 1;
});

function addTitle(tmdbId, { type = "movie", title = "Dune", year = "2021", poster = null, tmdbPoster = null, overview = "" } = {}) {
  env.DB.sqlite.prepare(
    "INSERT INTO titles (type, tmdb_id, title, year, poster, tmdb_poster, detail, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)",
  ).run(type, tmdbId, title, year, poster, tmdbPoster, JSON.stringify({ overview }));
}

function addLink(tmdbId, at, { type = "movie", quality = "1080p", audio = [], subs = [], season = null } = {}) {
  const id = nextLink++;
  env.DB.sqlite.prepare(
    "INSERT INTO links (id, type, tmdb_id, season, quality, audio, subs, url, link_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, type, tmdbId, season, quality, JSON.stringify(audio), JSON.stringify(subs), link(id), link(id, null) + "k", at, at);
}

const getFeed = (path = "/feed.xml") => worker.fetch(new Request(`https://cositalogo.test${path}`), env);
const items = (xml) => xml.split("<item>").slice(1);

test("an empty catalog gives a valid empty feed with the right headers", async () => {
  const res = await getFeed();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/rss+xml; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "public, max-age=300");
  const xml = await res.text();
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<rss version="2.0"/);
  assert.match(xml, /<atom:link href="https:\/\/cositalogo.test\/feed.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.equal(items(xml).length, 0);
  assert.match(xml, /<\/channel>\n<\/rss>$/);
});

test("an item has a title with qualities, SPA link, guid, RFC 822 date, description and poster", async () => {
  addTitle(438631, { overview: "Arrakis & more.", tmdbPoster: "https://image.tmdb.org/p.jpg" });
  addLink(438631, T0, { quality: "4K", audio: ["Castellano"], subs: ["Inglés"] });
  const xml = await (await getFeed()).text();
  const [item] = items(xml);
  assert.match(item, /<title>Dune \(2021\) · 4K<\/title>/);
  assert.match(item, /<link>https:\/\/cositalogo.test\/movie\/438631<\/link>/);
  assert.match(item, /<guid isPermaLink="false">movie:438631:1<\/guid>/);
  assert.match(item, /<pubDate>Tue, 20 Oct 2026 10:00:00 GMT<\/pubDate>/);
  assert.match(item, /<description>Arrakis &amp; more\.\n\nCalidad: 4K\. Audio: Castellano\. Subtítulos: Inglés<\/description>/);
  assert.match(item, /<media:thumbnail url="https:\/\/image.tmdb.org\/p.jpg"\/>/);
});

test("a manual poster wins over the TMDB one, and no poster means no thumbnail", async () => {
  addTitle(1, { poster: "https://example.test/mine.jpg", tmdbPoster: "https://image.tmdb.org/p.jpg" });
  addTitle(2);
  addLink(1, T0);
  addLink(2, T0 + 1);
  const [second, first] = items(await (await getFeed()).text());
  assert.doesNotMatch(second, /media:thumbnail/);
  assert.match(first, /mine\.jpg/);
});

test("series items link to /series and list the season", async () => {
  addTitle(1399, { type: "series", title: "Juego de tronos", year: "2011" });
  addLink(1399, T0, { type: "series", season: "2" });
  const [item] = items(await (await getFeed()).text());
  assert.match(item, /<link>https:\/\/cositalogo.test\/series\/1399<\/link>/);
  assert.match(item, /Temporada: 2/);
});

test("links of one title added the same UTC day make one item, newest qualities first", async () => {
  addTitle(1);
  addLink(1, T0, { quality: "1080p", audio: ["Castellano"] });
  addLink(1, T0 + 3600e3, { quality: "4K", audio: ["Latino"] });
  addLink(1, T0 + 7200e3, { quality: "4K" });
  const list = items(await (await getFeed()).text());
  assert.equal(list.length, 1);
  assert.match(list[0], /<title>Dune \(2021\) · 4K, 1080p<\/title>/);
  assert.match(list[0], /<guid isPermaLink="false">movie:1:3<\/guid>/);
  assert.match(list[0], /Audio: Latino, Castellano/);
  assert.match(list[0], /<pubDate>Tue, 20 Oct 2026 12:00:00 GMT<\/pubDate>/);
});

test("links added on different days, or to different titles, are different items, newest first", async () => {
  addTitle(1);
  addTitle(2, { title: "Arrival", year: "2016" });
  addLink(1, T0 - 2 * DAY);
  addLink(2, T0 - DAY);
  addLink(1, T0);
  const list = items(await (await getFeed()).text());
  assert.equal(list.length, 3);
  assert.match(list[0], /Dune/);
  assert.match(list[1], /Arrival/);
  assert.match(list[2], /Dune/);
});

test("the feed keeps the latest 50 items", async () => {
  addTitle(1);
  for (let i = 0; i < 60; i++) addLink(1, T0 - i * DAY);
  const list = items(await (await getFeed()).text());
  assert.equal(list.length, 50);
});

test("hostile text is escaped everywhere and the document stays well formed", async () => {
  const evil = `<b>&"'</b> ]]> <script>`;
  addTitle(1, { title: evil, year: evil, overview: evil, tmdbPoster: `https://x.test/a?b=1&c="2"` });
  addLink(1, T0, { audio: [evil], subs: [evil], season: evil });
  const xml = await (await getFeed()).text();
  const body = xml.replace(/^<\?xml[^>]*\?>/, "").replace(/<\/?(rss|channel|item|title|link|guid|pubDate|description|language|lastBuildDate)\b[^>]*>/g, "").replace(/<(atom:link|media:thumbnail)[^>]*\/>/g, "");
  assert.doesNotMatch(body, /<|\]\]>/);
  assert.match(xml, /&lt;b&gt;&amp;&quot;&apos;&lt;\/b&gt; \]\]&gt; &lt;script&gt;/);
  assert.match(xml, /url="https:\/\/x.test\/a\?b=1&amp;c=&quot;2&quot;"/);
});

test("control characters that XML cannot carry are dropped", async () => {
  addTitle(1, { title: "A\u000BB\u0008C" });
  addLink(1, T0);
  assert.match(await (await getFeed()).text(), /<title>ABC \(2021\)/);
});

test("Telegram URLs never appear in the feed", async () => {
  addTitle(1);
  addLink(1, T0);
  const xml = await (await getFeed()).text();
  assert.doesNotMatch(xml, /t\.me/);
});

test("only GET reaches the feed", async () => {
  const res = await worker.fetch(new Request("https://cositalogo.test/feed.xml", { method: "POST" }), env);
  assert.equal(res.status, 405);
});
