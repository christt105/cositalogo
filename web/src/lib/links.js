import { REVIEW_TAGS, withoutReviewTags } from "../../../shared/rules.js";

/** Tags typed as `HDR, REMUX` into a clean list without blanks or repeats. */
export function parseTags(text) {
  return [...new Set(text.split(",").map((t) => t.trim()).filter(Boolean))];
}

/** A season value from the form (`"3"`, `"all"`) as the API takes it. */
export function seasonFromForm(value) {
  return value === "all" ? "all" : Number(value);
}

/** The body for adding or editing a link from the form fields; `season` only for series. */
export function linkBody(type, fields) {
  return {
    ...(type === "series" ? { season: seasonFromForm(fields.season) } : {}),
    quality: fields.quality,
    audio: fields.audio,
    subs: fields.subs,
    tags: parseTags(fields.tags),
    link: fields.link.trim(),
  };
}

/** The form fields for an existing link. */
export function linkFields(link) {
  return {
    season: link.season === undefined ? "" : String(link.season),
    quality: link.quality,
    audio: [...link.audio],
    subs: [...link.subs],
    tags: withoutReviewTags(link.tags).join(", "),
    link: link.link,
  };
}

/** Whether the scan left a link to check: `"doubtful"`, `"auto"` or null. */
export function reviewState(tags) {
  if (tags.includes("dudoso")) return "doubtful";
  return tags.includes("auto") ? "auto" : null;
}

/** The tags a link shows, without the review ones. */
export function shownTags(tags) {
  return tags.filter((t) => !REVIEW_TAGS.includes(t));
}

const LIST_PARAMS = ["audio", "subs"];

/**
 * Initial form fields from query parameters (`link`, `quality`, `audio` and
 * `subs` as comma lists, `season`, `tags`), as the scan report's
 * "Identificar" links carry them; null when there are none.
 */
export function linkFieldsFromQuery(query) {
  const fields = {};
  for (const key of ["link", "quality", "season", "tags"]) if (query.get(key)) fields[key] = query.get(key);
  for (const key of LIST_PARAMS) if (query.get(key)) fields[key] = query.get(key).split(",").map((v) => v.trim()).filter(Boolean);
  return Object.keys(fields).length ? fields : null;
}
