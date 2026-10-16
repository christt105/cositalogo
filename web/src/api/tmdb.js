import { TMDB_URL_RE, TMDB_ID_RE, IMDB_ID_RE } from "../../../shared/rules.js";
import { nameOf, yearOf } from "../lib/forms.js";
import { groupPosters } from "../lib/posters.js";

export const IMG = "https://image.tmdb.org/t/p";
export const TMDB_PROXY_URL = "https://cositeca-tmdb-proxy.christt105.workers.dev";

/**
 * GET from the TMDB proxy. `localStorage.tmdbProxy`, when set, points it at
 * another proxy (for example `wrangler dev` on localhost).
 */
export async function proxyGet(path) {
  const base = localStorage.getItem("tmdbProxy") || TMDB_PROXY_URL;
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`proxy ${path} failed: ${res.status}`);
  return res.json();
}

const TYPES = { movie: "movie", tv: "series" };

/** A TMDB search or lookup result as the app shows it. */
function hit(result, tmdbType) {
  return {
    type: TYPES[tmdbType],
    tmdb: result.id,
    title: nameOf(result),
    year: yearOf(result),
    poster: result.poster_path ? `${IMG}/w92${result.poster_path}` : null,
  };
}

/**
 * Titles for what the user typed: a TMDB URL or `tmdb:<id>` points at one
 * title, an IMDb id is looked up, and anything else is a search of movies
 * and series.
 */
export async function searchTitles(query, get = proxyGet) {
  const url = TMDB_URL_RE.exec(query);
  if (url) return [{ type: TYPES[url[1]], tmdb: Number(url[2]) }];
  const id = TMDB_ID_RE.exec(query);
  if (id) return [{ type: "movie", tmdb: Number(id[1]) }];
  if (IMDB_ID_RE.test(query)) {
    const found = await get(`/find/${query}`);
    if (found.movie_results?.[0]) return [hit(found.movie_results[0], "movie")];
    if (found.tv_results?.[0]) return [hit(found.tv_results[0], "tv")];
    return [];
  }
  const data = await get(`/search?q=${encodeURIComponent(query)}&type=multi`);
  return (data.results ?? [])
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .slice(0, 10)
    .map((r) => hit(r, r.media_type));
}

/** Title, year, poster, original language and, for series, the TMDB seasons of one title. */
export async function getTmdbTitle(type, id, get = proxyGet) {
  const info = await get(`/${type === "series" ? "tv" : "movie"}/${id}`);
  return {
    type,
    tmdb: id,
    title: nameOf(info),
    year: yearOf(info),
    poster: info.poster_path ? `${IMG}/w342${info.poster_path}` : null,
    originalLanguage: info.original_language ?? null,
    seasons: type === "series" ? (info.seasons ?? []) : [],
  };
}

/**
 * The TMDB posters of a title in the picker's language groups, each poster
 * as `{ value, thumb }`: the URL to store and a smaller one to show.
 */
export async function getTmdbPosters(type, id, originalLanguage, get = proxyGet) {
  const data = await get(`/images?type=${type === "series" ? "tv" : "movie"}&id=${id}`);
  return groupPosters(data.posters, originalLanguage).map((group) => ({
    key: group.key,
    label: group.label,
    posters: group.posters.map((p) => ({ value: `${IMG}/w342${p.file_path}`, thumb: `${IMG}/w185${p.file_path}` })),
  }));
}
