import {
  TELEGRAM_LINK_RE,
  TMDB_URL_RE,
  TMDB_ID_RE,
  IMDB_ID_RE,
  cleanNewLanguage,
  newLanguageError,
  normalizeText,
  linkKey,
} from "../site/rules.js";

export { TELEGRAM_LINK_RE, TMDB_URL_RE, TMDB_ID_RE, IMDB_ID_RE };
export const FILENAME_RE = /^\d+\.yaml$/;

export class ValidationError extends Error {}

/**
 * Registry of links by linkKey. `add(link, path)` returns the path that
 * already holds the same link, or undefined after registering it.
 */
export function createLinkIndex() {
  const seen = new Map();
  return {
    add(link, path) {
      const key = linkKey(link);
      if (seen.has(key)) return seen.get(key);
      seen.set(key, path);
      return undefined;
    },
  };
}

export function parseTelegramLink(link) {
  if (typeof link !== "string") {
    throw new ValidationError(`link must be a string, got ${typeof link}`);
  }
  if (link.includes("t.me/+") || link.includes("joinchat")) {
    throw new ValidationError(
      `invite links are not allowed: ${link}`
    );
  }
  const match = TELEGRAM_LINK_RE.exec(link);
  if (!match) {
    throw new ValidationError(
      `link must match https://t.me/c/<group>/[<topic>/]<message>: ${link}`
    );
  }
  const [, groupId, topicId, messageId] = match;
  return {
    groupId,
    topicId: topicId ?? null,
    messageId,
  };
}

export function parseTmdbInput(input, { hasSeason } = {}) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ValidationError("tmdb input is required");
  }
  const value = input.trim();

  const urlMatch = TMDB_URL_RE.exec(value);
  if (urlMatch) {
    return { source: "url", type: urlMatch[1], id: Number(urlMatch[2]) };
  }

  const idMatch = TMDB_ID_RE.exec(value);
  if (idMatch) {
    return {
      source: "tmdbId",
      type: hasSeason ? "tv" : "movie",
      id: Number(idMatch[1]),
    };
  }

  if (IMDB_ID_RE.test(value)) {
    return { source: "imdb", imdbId: value };
  }

  throw new ValidationError(
    `tmdb input must be a themoviedb.org URL, tmdb:<id> or an IMDB id: ${value}`
  );
}

export function validateQuality(quality, qualities) {
  if (!qualities.includes(quality)) {
    throw new ValidationError(
      `quality "${quality}" is not one of: ${qualities.join(", ")}`
    );
  }
}

export function validateSeason(season, type) {
  if (type === "series") {
    if (season === undefined || season === null) {
      throw new ValidationError("season is required for series entries");
    }
    if (season !== "all" && !(Number.isInteger(season) && season >= 0)) {
      throw new ValidationError(
        `season must be "all" or an integer >= 0, got ${JSON.stringify(season)}`
      );
    }
  } else if (season !== undefined) {
    throw new ValidationError("season is not allowed for movie entries");
  }
}

export function validateTags(tags) {
  if (tags === undefined) return;
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) {
    throw new ValidationError("tags must be an array of strings");
  }
}

export function validateLanguages(values, field, allowed) {
  if (values === undefined) return;
  if (!Array.isArray(values) || !values.every((v) => typeof v === "string")) {
    throw new ValidationError(`${field} must be an array of strings`);
  }
  const seen = new Set();
  for (const value of values) {
    if (!allowed.includes(value)) {
      throw new ValidationError(
        `${field} "${value}" is not one of: ${allowed.join(", ")}`
      );
    }
    if (seen.has(value)) {
      throw new ValidationError(`${field} has duplicate value "${value}"`);
    }
    seen.add(value);
  }
}

export function sanitizeNewLanguage(raw, existing) {
  if (raw === undefined || raw === null) return undefined;
  const value = cleanNewLanguage(raw);
  if (value === "") return undefined;
  const error = newLanguageError(value);
  if (error) throw new ValidationError(`${error} Recibido: ${value}`);
  const key = normalizeText(value);
  const existingMatch = existing.find((v) => normalizeText(v) === key);
  return existingMatch ?? value;
}

const HTTPS_URL_RE = /^https:\/\/[^\s/?#@]+(?:[/?#]\S*)?$/;

export function validatePoster(poster) {
  if (poster === undefined) return;
  if (typeof poster !== "string" || poster.trim() === "") {
    throw new ValidationError("poster must be a non-empty string");
  }
  if (!HTTPS_URL_RE.test(poster)) {
    throw new ValidationError(`poster must be an https:// URL, got ${poster}`);
  }
}

export function validateSeasonPosters(seasonPosters, type) {
  if (seasonPosters === undefined) return;
  if (type !== "series") {
    throw new ValidationError("seasonPosters is not allowed for movie entries");
  }
  if (typeof seasonPosters !== "object" || seasonPosters === null || Array.isArray(seasonPosters)) {
    throw new ValidationError("seasonPosters must be a mapping of season to poster URL");
  }
  for (const [season, poster] of Object.entries(seasonPosters)) {
    if (season !== "all" && !/^\d+$/.test(season)) {
      throw new ValidationError(
        `seasonPosters key must be "all" or an integer >= 0, got ${JSON.stringify(season)}`
      );
    }
    if (typeof poster !== "string" || poster.trim() === "") {
      throw new ValidationError(`seasonPosters["${season}"] must be a non-empty string`);
    }
    if (!HTTPS_URL_RE.test(poster)) {
      throw new ValidationError(`seasonPosters["${season}"] must be an https:// URL, got ${poster}`);
    }
  }
}

export function validateLinkEntry(entry, { type, qualities, groups, languages }) {
  if (typeof entry !== "object" || entry === null) {
    throw new ValidationError("each link entry must be an object");
  }
  validateSeason(entry.season, type);
  if (entry.quality === undefined) {
    throw new ValidationError("quality is required");
  }
  validateQuality(entry.quality, qualities);
  validateLanguages(entry.audio, "audio", languages.audio);
  validateLanguages(entry.subs, "subs", languages.subs);
  validateTags(entry.tags);
  const { groupId } = parseTelegramLink(entry.link);
  if (!Object.prototype.hasOwnProperty.call(groups, groupId)) {
    throw new ValidationError(`unknown telegram group id: ${groupId}`);
  }
}

export function validateTitleFile(type, filename, data, { qualities, groups, languages }) {
  if (!FILENAME_RE.test(filename)) {
    throw new ValidationError(`invalid filename: ${filename}`);
  }
  if (type !== "movies" && type !== "series") {
    throw new ValidationError(`invalid type: ${type}`);
  }
  if (typeof data !== "object" || data === null) {
    throw new ValidationError("file content must be a YAML mapping");
  }
  if (!Array.isArray(data.links) || data.links.length === 0) {
    throw new ValidationError("links must be a non-empty array");
  }
  validatePoster(data.poster);
  const entryType = type === "movies" ? "movie" : "series";
  validateSeasonPosters(data.seasonPosters, entryType);
  for (const entry of data.links) {
    validateLinkEntry(entry, { type: entryType, qualities, groups, languages });
  }
}

/**
 * A TMDB movie or tv response with `translations` (from
 * `append_to_response=translations`) reduced to the English ones, the only
 * ones the build reads, so the cache does not store every language.
 */
export function keepEnglishTranslations(data) {
  const all = data.translations?.translations ?? [];
  return {
    ...data,
    translations: { translations: all.filter((t) => t.iso_639_1 === "en") },
  };
}

export function hasTranslations(value) {
  return Array.isArray(value?.translations?.translations);
}

/**
 * The English title of a TMDB movie or tv response carrying translations:
 * the en-US one, else any other non-empty English one. Null when there is
 * none or it matches (ignoring case and accents) any of `otherTitles`.
 */
export function englishTitle(info, otherTitles = []) {
  const titleOf = (t) => (t.data?.title || t.data?.name || "").trim();
  const english = (info.translations?.translations ?? []).filter(
    (t) => t.iso_639_1 === "en" && titleOf(t)
  );
  const chosen = english.find((t) => t.iso_3166_1 === "US") ?? english[0];
  if (!chosen) return null;
  const title = titleOf(chosen);
  const key = normalizeText(title);
  if (otherTitles.some((other) => other && normalizeText(other) === key)) return null;
  return title;
}
