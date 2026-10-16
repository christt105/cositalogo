/**
 * Link and search rules shared by the API (`tools/cositalogo-api`) and the
 * web app (`web/`).
 */
export const TELEGRAM_LINK_RE = /^https:\/\/t\.me\/c\/(\d+)\/(?:(\d+)\/)?(\d+)$/;
export const TMDB_URL_RE = /^https?:\/\/(?:www\.)?themoviedb\.org\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(movie|tv)\/(\d+)(?:-[^/?#]*)?(?:\/season\/\d+)?\/?(?:[?#].*)?$/;
export const TMDB_ID_RE = /^tmdb:(\d+)$/;
export const IMDB_ID_RE = /^tt\d{1,12}$/;

export function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Identity of a t.me link, ignoring its topic: the link rebuilt from its
 * group and message id. A string that is not a t.me/c link is its own identity.
 */
export function linkKey(link) {
  const match = TELEGRAM_LINK_RE.exec(link ?? "");
  return match ? `https://t.me/c/${match[1]}/${match[3]}` : link;
}

export function matchesSearch(item, query) {
  if (!query) return true;
  if (/^tt\d+$/.test(query)) {
    return item.imdb === query;
  }
  const q = normalizeText(query);
  if (/^\d+$/.test(query) && String(item.tmdb) === query) return true;
  return (
    normalizeText(item.title).includes(q) ||
    normalizeText(item.originalTitle || "").includes(q) ||
    normalizeText(item.englishTitle || "").includes(q)
  );
}
