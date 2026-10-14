import { describe, expect, it, vi } from "vitest";
import { fetchCatalog, searchCatalog, seasonSummary } from "./catalog.js";

const movie = { type: "movie", tmdb: 550, imdb: "tt0137523", title: "El club de la lucha", originalTitle: "Fight Club", links: [] };
const series = (seasons) => ({ type: "series", tmdb: 1399, title: "Juego de tronos", links: seasons.map((season) => ({ season })) });

describe("fetchCatalog", () => {
  it("revalidates /api/catalog and returns its body", async () => {
    const fetchImpl = vi.fn(async () => new Response("[1]", { status: 200 }));
    expect(await fetchCatalog(fetchImpl)).toEqual([1]);
    expect(fetchImpl).toHaveBeenCalledWith("/api/catalog", { cache: "no-cache" });
  });

  it("rejects on an error status", async () => {
    await expect(fetchCatalog(async () => new Response("", { status: 500 }))).rejects.toThrow("HTTP 500");
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
