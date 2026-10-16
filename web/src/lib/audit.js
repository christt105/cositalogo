import { titleKey } from "./catalog.js";

const VERBS = {
  add: "Añadió",
  update: "Editó",
  move: "Movió un enlace",
  delete: "Borró",
  poster: "Cambió la portada de",
  grant: "Dio acceso a",
  revoke: "Quitó acceso a",
};

const FIELDS = { season: "temporada", quality: "calidad", audio: "audio", subs: "subtítulos", tags: "etiquetas", link: "enlace" };

export const UNDOABLE = new Set(["add", "update", "move", "delete", "poster"]);

/** `T3`, `Serie completa` or nothing, for a season as links store it. */
export function seasonLabel(season) {
  if (season === undefined || season === null) return "";
  return season === "all" ? "Serie completa" : `T${season}`;
}

const show = (value) => (Array.isArray(value) ? value.join(", ") || "nada" : (value ?? "") === "" ? "nada" : String(value));
const fieldValue = (field, value) => (field === "season" ? seasonLabel(value) || "nada" : show(value));

/** A link in a few words: season, quality and languages. */
export function linkSummary(link) {
  return [seasonLabel(link.season), link.quality, ...link.audio, ...link.subs.map((s) => `subs ${s}`)].filter(Boolean).join(" · ");
}

/** The titles an entry is about, as `{ type, tmdb }`: the one after the write first, then the one before if it differs. */
export function entryTitles(entry) {
  const poster = entry.action === "poster" ? /^(movie|series):(\d+)/.exec(entry.target) : null;
  if (poster) return [{ type: poster[1], tmdb: Number(poster[2]) }];
  const titles = [];
  for (const side of [entry.after, entry.before]) {
    if (side && typeof side === "object" && side.type && side.tmdb && !titles.some((t) => t.type === side.type && t.tmdb === side.tmdb)) {
      titles.push({ type: side.type, tmdb: side.tmdb });
    }
  }
  return titles;
}

/** What changed, in words: the fields of an edit, where a move went, a link's summary or who got access. */
export function entryDetail(entry, titleName = (t) => `${t.type} ${t.tmdb}`) {
  const { action, before, after } = entry;
  switch (action) {
    case "update":
      return Object.keys(FIELDS)
        .filter((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after?.[f] ?? null))
        .map((f) => (f === "link" ? "enlace cambiado" : `${FIELDS[f]}: ${fieldValue(f, before?.[f])} → ${fieldValue(f, after?.[f])}`))
        .join("; ");
    case "move": {
      const [to, from = to] = entryTitles(entry);
      const where = (t, side) => `${titleName(t)}${seasonLabel(side.season) ? ` ${seasonLabel(side.season)}` : ""}`;
      return `de ${where(from, before)} a ${where(to, after)}`;
    }
    case "add":
      return linkSummary(after);
    case "delete":
      return linkSummary(before);
    case "poster": {
      const season = /^(?:movie|series):\d+:(.+)$/.exec(entry.target)?.[1];
      const what = after ? "manual" : "la de TMDB";
      return season ? `${seasonLabel(season)}: ${what}` : what;
    }
    case "grant":
    case "revoke":
      return `${(after ?? before)?.name || entry.target}${entry.target.startsWith("admin:") ? " (admin)" : ""}`;
    default:
      return entry.target;
  }
}

/** The title to name after the verb, or null for a move, whose detail names both. */
export function entryTitle(entry) {
  return entry.action === "move" ? null : entryTitles(entry)[0] ?? null;
}

export function entryVerb(entry) {
  return VERBS[entry.action] ?? entry.action;
}

/** The catalog name of a title, or its type and id when it is no longer in the catalog. */
export function titleNameFrom(byKey) {
  return (t) => byKey.get(titleKey(t.type, t.tmdb))?.title ?? `${t.type === "movie" ? "película" : "serie"} ${t.tmdb}`;
}

/** A timestamp as a short Spanish date and time. */
export function when(at) {
  return new Date(at).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
