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
    tags: link.tags.join(", "),
    link: link.link,
  };
}
