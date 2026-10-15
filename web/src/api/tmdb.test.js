import { describe, expect, it, vi } from "vitest";
import { getTmdbTitle, searchTitles } from "./tmdb.js";

describe("searchTitles", () => {
  it("points a TMDB URL or tmdb:<id> straight at one title", async () => {
    const get = vi.fn();
    expect(await searchTitles("https://www.themoviedb.org/tv/1399-game-of-thrones", get)).toEqual([{ type: "series", tmdb: 1399 }]);
    expect(await searchTitles("tmdb:550", get)).toEqual([{ type: "movie", tmdb: 550 }]);
    expect(get).not.toHaveBeenCalled();
  });

  it("looks up an IMDb id", async () => {
    const get = vi.fn(async () => ({ movie_results: [], tv_results: [{ id: 1399, name: "Juego de tronos", first_air_date: "2011-04-17", poster_path: "/got.jpg" }] }));
    expect(await searchTitles("tt0944947", get)).toEqual([
      { type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: "https://image.tmdb.org/t/p/w92/got.jpg" },
    ]);
    expect(get).toHaveBeenCalledWith("/find/tt0944947");
  });

  it("searches movies and series, leaving people out", async () => {
    const get = vi.fn(async () => ({
      results: [
        { media_type: "person", id: 1, name: "Brad Pitt" },
        { media_type: "movie", id: 550, title: "El club de la lucha", release_date: "1999-10-15", poster_path: null },
      ],
    }));
    expect(await searchTitles("club & co", get)).toEqual([{ type: "movie", tmdb: 550, title: "El club de la lucha", year: "1999", poster: null }]);
    expect(get).toHaveBeenCalledWith("/search?q=club%20%26%20co&type=multi");
  });
});

describe("getTmdbTitle", () => {
  it("keeps the seasons of a series", async () => {
    const get = vi.fn(async () => ({ id: 1399, name: "Juego de tronos", first_air_date: "2011-04-17", poster_path: "/got.jpg", seasons: [{ season_number: 1 }] }));
    expect(await getTmdbTitle("series", 1399, get)).toEqual({
      type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: "https://image.tmdb.org/t/p/w342/got.jpg", seasons: [{ season_number: 1 }],
    });
    expect(get).toHaveBeenCalledWith("/tv/1399");
  });
});
