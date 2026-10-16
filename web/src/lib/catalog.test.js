import { describe, expect, it } from "vitest";
import { filterCatalog, filterOptions, searchCatalog, seasonSummary, titleKey } from "./catalog.js";

const movie = { type: "movie", tmdb: 550, imdb: "tt0137523", title: "El club de la lucha", originalTitle: "Fight Club", links: [] };
const series = (seasons) => ({ type: "series", tmdb: 1399, title: "Juego de tronos", links: seasons.map((season) => ({ season })) });

describe("titleKey", () => {
  it("joins the type and the TMDB id", () => {
    expect(titleKey("series", 1399)).toBe("series/1399");
  });
});

describe("searchCatalog", () => {
  const catalog = [movie, series([1])];

  it("returns the whole catalog for a blank query", () => {
    expect(searchCatalog(catalog, "  ")).toBe(catalog);
  });

  it("matches titles, original titles, TMDB and IMDb ids", () => {
    expect(searchCatalog(catalog, "fight")).toEqual([movie]);
    expect(searchCatalog(catalog, "tronos")).toEqual([catalog[1]]);
    expect(searchCatalog(catalog, "550")).toEqual([movie]);
    expect(searchCatalog(catalog, "tt0137523")).toEqual([movie]);
  });
});

describe("seasonSummary", () => {
  it("is empty for movies and whole-series links", () => {
    expect(seasonSummary(movie)).toBe("");
    expect(seasonSummary(series([1, "all"]))).toBe("");
  });

  it("collapses contiguous seasons into a range", () => {
    expect(seasonSummary(series([2]))).toBe("T2");
    expect(seasonSummary(series([3, 1, 2, 2]))).toBe("T1-3");
    expect(seasonSummary(series([1, 3]))).toBe("T1,3");
  });
});

describe("filterOptions", () => {
  it("lists the distinct values of each filter, sorted", () => {
    const catalog = [
      { type: "movie", genres: ["Drama"], links: [{ quality: "1080p", audio: ["Español"], subs: [] }] },
      { type: "series", genres: ["Acción", "Drama"], links: [{ quality: "4K", audio: ["Español", "Inglés"], subs: ["Español"] }] },
    ];
    expect(filterOptions(catalog)).toEqual({
      quality: ["1080p", "4K"],
      audio: ["Español", "Inglés"],
      subs: ["Español"],
      genre: ["Acción", "Drama"],
    });
  });
});

describe("filterCatalog", () => {
  const a = { type: "movie", genres: ["Drama"], links: [{ quality: "4K", audio: ["Inglés"], subs: ["Español"] }, { quality: "1080p", audio: ["Español"], subs: [] }] };
  const b = { type: "series", genres: ["Acción"], links: [{ quality: "1080p", audio: ["Español"], subs: [] }] };
  const catalog = [a, b];

  it("returns the whole catalog when no filter is set", () => {
    expect(filterCatalog(catalog, {})).toBe(catalog);
    expect(filterCatalog(catalog, { type: "" })).toBe(catalog);
  });

  it("filters by type and genre", () => {
    expect(filterCatalog(catalog, { type: "series" })).toEqual([b]);
    expect(filterCatalog(catalog, { genre: "Drama" })).toEqual([a]);
  });

  it("requires quality, audio and subs to hold on the same link", () => {
    expect(filterCatalog(catalog, { quality: "1080p" })).toEqual([a, b]);
    expect(filterCatalog(catalog, { quality: "4K", audio: "Inglés", subs: "Español" })).toEqual([a]);
    expect(filterCatalog(catalog, { quality: "4K", audio: "Español" })).toEqual([]);
  });
});
