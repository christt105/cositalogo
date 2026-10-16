export const POSTER_PAGE = 12;

const FIXED_GROUPS = [
  { key: "es", lang: "es", label: "Castellano" },
  { key: "en", lang: "en", label: "Inglés" },
  { key: "null", lang: null, label: "Sin texto" },
];

export function languageName(code) {
  try {
    const name = new Intl.DisplayNames(["es"], { type: "language" }).of(code);
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

function byVotes(a, b) {
  return (b.vote_count ?? 0) - (a.vote_count ?? 0) || (b.vote_average ?? 0) - (a.vote_average ?? 0);
}

/** Splits TMDB posters into the picker's language groups (es, en, no text, original language), each sorted by votes then rating; empty groups are dropped. */
export function groupPosters(posters, originalLanguage) {
  const defs = [...FIXED_GROUPS];
  if (originalLanguage && !["es", "en"].includes(originalLanguage)) {
    defs.push({ key: "vo", lang: originalLanguage, label: `VO (${languageName(originalLanguage)})` });
  }
  return defs
    .map((def) => ({
      key: def.key,
      label: def.label,
      posters: (posters || []).filter((p) => (p.iso_639_1 ?? null) === def.lang).sort(byVotes),
    }))
    .filter((g) => g.posters.length > 0);
}
