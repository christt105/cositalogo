import { describe, expect, it } from "vitest";
import { searchCatalog, seasonSummary, titleKey } from "./catalog.js";

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
