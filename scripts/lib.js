import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ValidationError, keepEnglishTranslations, hasTranslations } from "./validation.js";

export * from "./validation.js";

/**
 * Maps each path to the timestamp of its latest addition, from the output of
 * `git log --no-renames --diff-filter=A --name-only --format=%x00%at`, which
 * lists commits newest first with each header line starting with a NUL.
 */
export function parseAddedTimestamps(output) {
  const timestamps = new Map();
  let currentTimestamp = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("\0")) {
      currentTimestamp = Number(line.slice(1));
    } else if (line.trim() && currentTimestamp !== null && !timestamps.has(line)) {
      timestamps.set(line, currentTimestamp);
    }
  }
  return timestamps;
}

export function loadTmdbCache(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function saveTmdbCache(path, cache) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache));
}

export function purgeTmdbCache(cache, usedKeys) {
  for (const key of Object.keys(cache)) {
    if (!usedKeys.has(key)) {
      delete cache[key];
    }
  }
}

export const TMDB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createTmdbClient(apiKey, { cache = {}, now = () => Date.now() } = {}) {
  const useBearer = apiKey.startsWith("eyJ");
  const usedKeys = new Set();
  async function request(path, params = {}) {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    url.searchParams.set("language", "es-ES");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const headers = {};
    if (useBearer) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else {
      url.searchParams.set("api_key", apiKey);
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  async function requestWithTranslations(path) {
    const data = await request(path, { append_to_response: "translations" });
    return keepEnglishTranslations(data);
  }
  async function cached(key, fetcher, isComplete = () => true) {
    usedKeys.add(key);
    const entry = cache[key];
    const wrapped = entry && typeof entry.fetchedAt === "number";
    if (wrapped && now() - entry.fetchedAt < TMDB_CACHE_TTL_MS && isComplete(entry.value)) {
      return entry.value;
    }
    let value;
    try {
      value = await fetcher();
    } catch (err) {
      if (entry === undefined) throw err;
      return wrapped ? entry.value : entry;
    }
    cache[key] = { fetchedAt: now(), value };
    return value;
  }
  return {
    usedKeys,
    getMovie: (id) =>
      cached(`movie:${id}`, () => requestWithTranslations(`/movie/${id}`), hasTranslations),
    getTv: (id) =>
      cached(`tv:${id}`, () => requestWithTranslations(`/tv/${id}`), hasTranslations),
    getTvExternalIds: (id) =>
      cached(`tvExternalIds:${id}`, () => request(`/tv/${id}/external_ids`)),
    getTvSeason: (id, season) =>
      cached(`tvSeason:${id}:${season}`, () =>
        request(`/tv/${id}/season/${season}`)
      ),
    findByImdb: (imdbId) =>
      request(`/find/${imdbId}`, { external_source: "imdb_id" }),
    posterUrl: (path) =>
      path ? `https://image.tmdb.org/t/p/w342${path}` : null,
  };
}

export async function resolveTmdbTarget(descriptor, tmdbClient) {
  if (descriptor.source === "imdb") {
    const found = await tmdbClient.findByImdb(descriptor.imdbId);
    if (found.movie_results?.length) {
      return { type: "movie", id: found.movie_results[0].id };
    }
    if (found.tv_results?.length) {
      return { type: "tv", id: found.tv_results[0].id };
    }
    throw new ValidationError(`IMDB id not found on TMDB: ${descriptor.imdbId}`);
  }
  return { type: descriptor.type, id: descriptor.id };
}

/** True when the module at `moduleUrl` is the script node was started with, following symlinks. */
export function isEntrypoint(moduleUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
