import { TELEGRAM_LINK_RE, normalizeText } from "../site/rules.js";

export class ValidationError extends Error {}

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

/**
 * A TMDB movie or tv response with `translations` (from
 * `append_to_response=translations`) reduced to the English ones, the only
 * ones the catalog reads.
 */
export function keepEnglishTranslations(data) {
  const all = data.translations?.translations ?? [];
  return {
    ...data,
    translations: { translations: all.filter((t) => t.iso_639_1 === "en") },
  };
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
