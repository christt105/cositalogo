import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  TELEGRAM_LINK_RE,
  TMDB_URL_RE,
  TMDB_ID_RE,
  IMDB_ID_RE,
  linkKey,
  matchesSearch,
  normalizeText,
} from "../shared/rules.js";
import { GROUP_ID, OTHER_GROUP_ID, link } from "./fixtures.js";

describe("shared regexes", () => {
  test("TELEGRAM_LINK_RE captures group, optional topic and message", () => {
    assert.deepEqual(TELEGRAM_LINK_RE.exec(`https://t.me/c/${GROUP_ID}/42`)?.slice(1), [
      GROUP_ID,
      undefined,
      "42",
    ]);
    assert.deepEqual(TELEGRAM_LINK_RE.exec(`https://t.me/c/${GROUP_ID}/7/42`)?.slice(1), [
      GROUP_ID,
      "7",
      "42",
    ]);
  });

  test("TELEGRAM_LINK_RE rejects public channels, invites and query strings", () => {
    for (const value of [
      "https://t.me/canal/42",
      "https://t.me/+abcdef",
      `http://t.me/c/${GROUP_ID}/42`,
      `https://t.me/c/${GROUP_ID}/42?single`,
      `https://t.me/c/${GROUP_ID}/42/`,
    ]) {
      assert.equal(TELEGRAM_LINK_RE.test(value), false, value);
    }
  });

  test("TMDB_URL_RE accepts movie and tv URLs with an optional slug", () => {
    assert.deepEqual(TMDB_URL_RE.exec("https://www.themoviedb.org/movie/550")?.slice(1), [
      "movie",
      "550",
    ]);
    assert.deepEqual(
      TMDB_URL_RE.exec("https://themoviedb.org/tv/1396-breaking-bad")?.slice(1),
      ["tv", "1396"]
    );
  });

  test("TMDB_URL_RE accepts trailing slashes, language prefixes, queries and season URLs", () => {
    for (const [value, expected] of [
      ["https://www.themoviedb.org/movie/550/", ["movie", "550"]],
      ["https://www.themoviedb.org/es/movie/550", ["movie", "550"]],
      ["https://www.themoviedb.org/es-ES/movie/550-el-club-de-la-lucha/", ["movie", "550"]],
      ["https://www.themoviedb.org/movie/550-fight-club?language=es-ES", ["movie", "550"]],
      ["https://www.themoviedb.org/tv/1396/season/1", ["tv", "1396"]],
      ["https://www.themoviedb.org/tv/1396-breaking-bad/season/2/", ["tv", "1396"]],
    ]) {
      assert.deepEqual(TMDB_URL_RE.exec(value)?.slice(1), expected, value);
    }
  });

  test("TMDB_URL_RE rejects other TMDB pages and hosts", () => {
    for (const value of [
      "https://www.themoviedb.org/person/287",
      "https://www.themoviedb.org/movie/550/cast",
      "https://www.themoviedb.org/tv/1396/season/one",
      "https://www.themoviedb.org/spanish/movie/550",
      "https://evil.example/themoviedb.org/movie/550",
    ]) {
      assert.equal(TMDB_URL_RE.test(value), false, value);
    }
  });

  test("TMDB_ID_RE only accepts tmdb:<digits>", () => {
    assert.equal(TMDB_ID_RE.exec("tmdb:550")?.[1], "550");
    assert.equal(TMDB_ID_RE.test("tmdb:abc"), false);
    assert.equal(TMDB_ID_RE.test("550"), false);
  });

  test("IMDB_ID_RE accepts tt ids of up to 12 digits", () => {
    assert.equal(IMDB_ID_RE.test("tt0137523"), true);
    assert.equal(IMDB_ID_RE.test("tt1"), true);
    assert.equal(IMDB_ID_RE.test("nm0000138"), false);
    assert.equal(IMDB_ID_RE.test("tt"), false);
  });

  test("IMDB_ID_RE rejects more than 12 digits", () => {
    assert.equal(IMDB_ID_RE.test(`tt${"1".repeat(12)}`), true);
    assert.equal(IMDB_ID_RE.test(`tt${"1".repeat(13)}`), false);
    assert.equal(IMDB_ID_RE.test(`tt${"1".repeat(40)}`), false);
  });
});

describe("matchesSearch", () => {
  const item = { tmdb: 1917, imdb: "tt8579674", title: "1917", originalTitle: "1917" };
  const other = { tmdb: 550, imdb: "tt0137523", title: "El club de la lucha", originalTitle: "Fight Club" };

  test("an empty query matches everything", () => {
    assert.equal(matchesSearch(other, ""), true);
  });

  test("a numeric query matches the TMDB id", () => {
    assert.equal(matchesSearch(other, "550"), true);
    assert.equal(matchesSearch(other, "551"), false);
  });

  test("a numeric query also matches titles containing the digits", () => {
    const numericTitle = { tmdb: 1, imdb: "tt1", title: "2012", originalTitle: "2012" };
    assert.equal(matchesSearch(numericTitle, "2012"), true);
    assert.equal(matchesSearch(item, "1917"), true);
    assert.equal(matchesSearch(other, "1917"), false);
  });

  test("an IMDb id matches only the imdb field", () => {
    assert.equal(matchesSearch(other, "tt0137523"), true);
    assert.equal(matchesSearch(other, "tt9999999"), false);
  });

  test("text queries ignore case and accents in title and original title", () => {
    assert.equal(matchesSearch(other, "CLUB"), true);
    assert.equal(matchesSearch(other, "fight"), true);
    assert.equal(matchesSearch({ tmdb: 2, title: "Pelicula" }, "película"), true);
    assert.equal(matchesSearch(other, "xyz"), false);
  });

  test("matches the English title", () => {
    const chihiro = {
      tmdb: 129,
      imdb: "tt0245429",
      title: "El viaje de Chihiro",
      originalTitle: "千と千尋の神隠し",
      englishTitle: "Spirited Away",
    };
    assert.equal(matchesSearch(chihiro, "spirited away"), true);
    assert.equal(matchesSearch(chihiro, "chihiro"), true);
    assert.equal(matchesSearch(chihiro, "千と千尋"), true);
    assert.equal(matchesSearch(other, "spirited"), false);
  });
});

describe("normalizeText", () => {
  test("lowercases and strips diacritics", () => {
    assert.equal(normalizeText("Árbol Ñandú"), "arbol nandu");
  });
});

describe("linkKey", () => {
  test("ignores the topic segment", () => {
    assert.equal(linkKey(link(42, 7)), `https://t.me/c/${GROUP_ID}/42`);
    assert.equal(linkKey(link(42)), `https://t.me/c/${GROUP_ID}/42`);
    assert.equal(linkKey(link(42, 7)), linkKey(link(42, 16088)));
  });

  test("keeps group and message id apart", () => {
    assert.notEqual(linkKey(link(42)), linkKey(link(43)));
    assert.notEqual(linkKey(link(42)), linkKey(`https://t.me/c/${OTHER_GROUP_ID}/42`));
  });

  test("returns any other string unchanged", () => {
    assert.equal(linkKey("https://t.me/publico/1"), "https://t.me/publico/1");
    assert.equal(linkKey(`https://t.me/c/${GROUP_ID}/42/`), `https://t.me/c/${GROUP_ID}/42/`);
  });
});
