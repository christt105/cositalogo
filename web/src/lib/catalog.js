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
