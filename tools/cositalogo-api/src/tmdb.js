import { englishTitle, keepEnglishTranslations } from "./validation.js";
import { HttpError } from "./http.js";

const API = "https://api.themoviedb.org/3";

export const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null);
const backdropUrl = (path) => (path ? `https://image.tmdb.org/t/p/w780${path}` : null);

async function request(env, path, params = {}) {
  if (!env.TMDB_API_KEY) throw new HttpError(503, "TMDB is not configured");
  const url = new URL(`${API}${path}`);
  url.searchParams.set("language", "es-ES");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const headers = {};
  if (env.TMDB_API_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${env.TMDB_API_KEY}`;
  else url.searchParams.set("api_key", env.TMDB_API_KEY);
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `TMDB ${path} failed with ${res.status}`);
  return res.json();
}

/**
 * Column values for a `titles` row, with the catalog entry and detail
 * fields, built from TMDB. A 422 when TMDB does not know the id.
 */
export async function fetchTitle(env, type, tmdbId) {
  const isMovie = type === "movie";
  const raw = await request(env, `/${isMovie ? "movie" : "tv"}/${tmdbId}`, {
    append_to_response: isMovie ? "translations" : "translations,external_ids",
  });
  if (!raw) throw new HttpError(422, `TMDB has no ${isMovie ? "movie" : "series"} with id ${tmdbId}`);
  const info = keepEnglishTranslations(raw);
  const title = isMovie ? info.title : info.name;
  const originalTitle = isMovie ? info.original_title : info.original_name;
  const date = isMovie ? info.release_date : info.first_air_date;
  const detail = {
    overview: info.overview || "",
    tagline: info.tagline || "",
    genres: (info.genres ?? []).map((g) => g.name),
    backdrop: backdropUrl(info.backdrop_path),
    voteAverage: info.vote_average ?? null,
    ...(isMovie ? { runtime: info.runtime || null } : { numberOfSeasons: info.number_of_seasons ?? null, seasons: {} }),
  };
  return {
    imdb: (isMovie ? info.imdb_id : info.external_ids?.imdb_id) ?? null,
    title,
    original_title: originalTitle ?? null,
    english_title: englishTitle(info, [title, originalTitle]),
    year: date ? date.slice(0, 4) : null,
    tmdb_poster: posterUrl(info.poster_path),
    genres: detail.genres,
    detail,
  };
}

/** Name, poster, episode count and air date of one season, or null when TMDB has no such season. */
export async function fetchSeason(env, tmdbId, season) {
  const data = await request(env, `/tv/${tmdbId}/season/${season}`);
  if (!data) return null;
  return {
    name: data.name,
    poster: posterUrl(data.poster_path),
    episodeCount: data.episodes?.length ?? null,
    airDate: data.air_date || null,
  };
}
