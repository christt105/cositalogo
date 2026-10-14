import { matchesSearch } from "../../site/rules.js";

export const TYPE_LABELS = { movie: "Película", series: "Serie" };

/** Fetches the whole catalog from the API, revalidating its ETag on every load. */
export async function fetchCatalog(fetchImpl = fetch) {
  const res = await fetchImpl("/api/catalog", { cache: "no-cache" });
  if (!res.ok) throw new Error(`/api/catalog: HTTP ${res.status}`);
  return res.json();
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

/** Wraps `fn` so a call only runs `ms` after the calls stop coming in. */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
