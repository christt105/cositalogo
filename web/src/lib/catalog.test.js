import { describe, expect, it } from "vitest";
import { detailMeta, filterCatalog, formatRuntime, filterOptions, searchCatalog, seasonSummary, sortCatalog, titleKey } from "./catalog.js";

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

describe("formatRuntime", () => {
  it("formats hours and minutes", () => {
    expect(formatRuntime(135)).toBe("2 h 15 min");
    expect(formatRuntime(120)).toBe("2 h");
    expect(formatRuntime(45)).toBe("45 min");
  });

  it("is empty when missing or not positive", () => {
    for (const v of [null, undefined, 0, -5, NaN, "90"]) expect(formatRuntime(v)).toBe("");
  });
});

describe("detailMeta", () => {
  it("uses the runtime for movies and the season count for series", () => {
    expect(detailMeta("movie", { runtime: 135, numberOfSeasons: 3 })).toBe("2 h 15 min");
    expect(detailMeta("series", { numberOfSeasons: 8, runtime: 50 })).toBe("8 temporadas");
    expect(detailMeta("series", { numberOfSeasons: 1 })).toBe("1 temporada");
  });

  it("is empty when the detail is missing or partial", () => {
    expect(detailMeta("movie", null)).toBe("");
    expect(detailMeta("series", {})).toBe("");
    expect(detailMeta("series", { numberOfSeasons: null })).toBe("");
  });
});

describe("sortCatalog", () => {
  const t = (title, year) => ({ title, year });
  const catalog = [t("Zeta", "2001"), t("alma", null), t("Árbol", "1999"), t("Beta", "2001"), t("Eco", undefined), t("Ñu", "1980")];
  const titles = (items) => items.map((i) => i.title);

  it("keeps catalog order by default and for unknown values", () => {
    expect(sortCatalog(catalog, "")).toBe(catalog);
    expect(sortCatalog(catalog, undefined)).toBe(catalog);
    expect(sortCatalog(catalog, "bogus")).toBe(catalog);
  });

  it("reverses the catalog order for oldest", () => {
    expect(titles(sortCatalog(catalog, "oldest"))).toEqual(["Ñu", "Eco", "Beta", "Árbol", "alma", "Zeta"]);
  });

  it("sorts by year with ties in catalog order and missing years last", () => {
    expect(titles(sortCatalog(catalog, "year-desc"))).toEqual(["Zeta", "Beta", "Árbol", "Ñu", "alma", "Eco"]);
    expect(titles(sortCatalog(catalog, "year-asc"))).toEqual(["Ñu", "Árbol", "Zeta", "Beta", "alma", "Eco"]);
  });

  it("sorts by name ignoring case and accents", () => {
    expect(titles(sortCatalog(catalog, "name-asc"))).toEqual(["alma", "Árbol", "Beta", "Eco", "Ñu", "Zeta"]);
    expect(titles(sortCatalog(catalog, "name-desc"))).toEqual(["Zeta", "Ñu", "Eco", "Beta", "Árbol", "alma"]);
  });

  it("keeps catalog order between titles that compare equal by name", () => {
    const same = [{ title: "Á", id: 1 }, { title: "a", id: 2 }, { title: "A", id: 3 }];
    expect(sortCatalog(same, "name-asc").map((i) => i.id)).toEqual([1, 2, 3]);
    expect(sortCatalog(same, "name-desc").map((i) => i.id)).toEqual([1, 2, 3]);
  });

  it("never mutates the input", () => {
    const copy = [...catalog];
    for (const sort of ["oldest", "year-desc", "year-asc", "name-asc", "name-desc"]) sortCatalog(catalog, sort);
    expect(catalog).toEqual(copy);
  });
});
