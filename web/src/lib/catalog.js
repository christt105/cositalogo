import { matchesSearch } from "../../../shared/rules.js";

export const TYPE_LABELS = { movie: "Película", series: "Serie" };

/** The key that identifies a title across the app, `movie/550` or `series/1399`. */
export function titleKey(type, tmdb) {
  return `${type}/${tmdb}`;
}

/** The titles that match a search, in catalog order. */
export function searchCatalog(catalog, query) {
  const q = query.trim();
  return q ? catalog.filter((item) => matchesSearch(item, q)) : catalog;
}

export const FILTER_KEYS = ["type", "quality", "audio", "subs", "genre"];

const sortedUnique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));

/** The values each filter can take in a catalog, as `{ quality: [...], audio: [...], subs: [...], genre: [...] }`. */
export function filterOptions(catalog) {
  const links = catalog.flatMap((item) => item.links);
  return {
    quality: sortedUnique(links.map((l) => l.quality)),
    audio: sortedUnique(links.flatMap((l) => l.audio)),
    subs: sortedUnique(links.flatMap((l) => l.subs)),
    genre: sortedUnique(catalog.flatMap((item) => item.genres ?? [])),
  };
}

/**
 * The titles that satisfy every filter in `filters` (`type`, `quality`,
 * `audio`, `subs`, `genre`; blank ones are ignored). Quality, audio and subs
 * must all hold on the same link, so "4K" plus "Latino" finds titles with a
 * 4K Latino release, not a 4K one and a different Latino one.
 */
export function filterCatalog(catalog, filters) {
  const { type, quality, audio, subs, genre } = filters;
  if (!type && !quality && !audio && !subs && !genre) return catalog;
  const linkMatches = (l) => (!quality || l.quality === quality) && (!audio || l.audio.includes(audio)) && (!subs || l.subs.includes(subs));
  return catalog.filter(
    (item) => (!type || item.type === type) && (!genre || item.genres?.includes(genre)) && item.links.some(linkMatches)
  );
}

/** The seasons a series has links for, as `T1`, `T1-3` or `T1,3`; empty for movies or when any link covers the whole series. */
export function seasonSummary(item) {
  if (item.type !== "series") return "";
  const seasons = [...new Set(item.links.map((l) => l.season))];
  if (seasons.some((s) => typeof s !== "number")) return "";
  seasons.sort((a, b) => a - b);
  if (seasons.length === 1) return `T${seasons[0]}`;
  const contiguous = seasons.every((s, i) => i === 0 || s === seasons[i - 1] + 1);
  return contiguous ? `T${seasons[0]}-${seasons[seasons.length - 1]}` : `T${seasons.join(",")}`;
}
