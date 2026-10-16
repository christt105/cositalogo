import { dump } from "js-yaml";

export const GROUP_ID = "2229558644";
export const OTHER_GROUP_ID = "2142474284";

export function link(messageId, topicId) {
  return topicId
    ? `https://t.me/c/${GROUP_ID}/${topicId}/${messageId}`
    : `https://t.me/c/${GROUP_ID}/${messageId}`;
}

export function config() {
  return {
    qualities: ["1080p", "4K"],
    groups: { [GROUP_ID]: "Grupo 1", [OTHER_GROUP_ID]: "Grupo 2" },
    languages: {
      audio: ["Castellano", "Latino", "Inglés"],
      subs: ["Castellano", "Inglés", "Forzados"],
    },
  };
}

export function yaml(data) {
  return dump(data);
}

export function fakeTmdb({ movies = {}, tv = {}, find = {} } = {}) {
  const calls = [];
  function lookup(kind, table, id) {
    calls.push(`${kind}:${id}`);
    const info = table[id];
    if (!info) throw new Error(`TMDB /${kind}/${id} failed: 404 Not Found`);
    return info;
  }
  return {
    calls,
    getMovie: async (id) => lookup("movie", movies, id),
    getTv: async (id) => lookup("tv", tv, id),
    getTvExternalIds: async (id) => ({ imdb_id: tv[id]?.imdb_id ?? null }),
    findByImdb: async (imdbId) => {
      calls.push(`find:${imdbId}`);
      return find[imdbId] ?? { movie_results: [], tv_results: [] };
    },
    posterUrl: (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null),
  };
}

export const MOVIE_INFO = { id: 550, title: "El club de la lucha", poster_path: "/a.jpg" };

const CATALOG_MOVIES = {
  550: { id: 550, title: "El club de la lucha", original_title: "Fight Club", imdb_id: "tt0137523", release_date: "1999-10-15", poster_path: "/fc.jpg", genres: [{ name: "Drama" }] },
  680: { id: 680, title: "Pulp Fiction", original_title: "Pulp Fiction", imdb_id: "tt0110912", release_date: "1994-09-10", poster_path: "/pf.jpg", genres: [] },
};
const CATALOG_TV = { 1396: { id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", poster_path: "/bb.jpg", genres: [{ name: "Drama" }] } };

/** A TMDB stub with two movies and a series whose season 9 does not exist. */
export function catalogTmdb() {
  return {
    ...fakeTmdb({ movies: CATALOG_MOVIES, tv: CATALOG_TV }),
    getTvSeason: async (id, number) => {
      const season = String(number);
      if (season === "9") throw new Error("404");
      return { name: `Temporada ${season}`, poster_path: season === "1" ? "/s1.jpg" : null, air_date: "2008-01-20", episodes: [{}, {}] };
    },
  };
}
