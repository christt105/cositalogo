import { REVIEW_TAGS, withoutReviewTags } from "../../../shared/rules.js";
import { HttpError } from "./http.js";
import { updateLink } from "./links.js";

export const MAX_VERIFY = 50;

const parse = (text) => (text ? JSON.parse(text) : []);
const REVIEW_LIST = REVIEW_TAGS.map((t) => `'${t}'`).join(", ");

/**
 * The links still waiting for a person to check what the scan matched,
 * doubtful ones first and then newest first.
 */
export async function listReview(db) {
  const { results } = await db.prepare(
    "SELECT id, type, tmdb_id, season, quality, url, tags, created_at FROM links " +
      `WHERE EXISTS (SELECT 1 FROM json_each(links.tags) WHERE value IN (${REVIEW_LIST})) ` +
      "ORDER BY EXISTS (SELECT 1 FROM json_each(links.tags) WHERE value = 'dudoso') DESC, created_at DESC, id"
  ).all();
  return results.map((row) => ({
    id: row.id,
    type: row.type,
    tmdb: row.tmdb_id,
    ...(row.season === null ? {} : { season: /^\d+$/.test(row.season) ? Number(row.season) : row.season }),
    quality: row.quality,
    link: row.url,
    doubtful: parse(row.tags).includes("dudoso"),
    postedAt: row.created_at,
  }));
}

/** Clears the review tags of up to MAX_VERIFY links, each as an audited edit; links without them are left alone. */
export async function verifyLinks(env, user, settings, body, now = Date.now()) {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_VERIFY || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new HttpError(400, `ids must be a list of 1 to ${MAX_VERIFY} link ids`);
  }
  let verified = 0;
  for (const id of new Set(ids)) {
    const row = await env.DB.prepare("SELECT tags FROM links WHERE id = ?").bind(id).first();
    if (!row) throw new HttpError(404, `no link ${id}`);
    const tags = parse(row.tags);
    const kept = withoutReviewTags(tags);
    if (kept.length === tags.length) continue;
    await updateLink(env, user, settings, id, { tags: kept }, now);
    verified++;
  }
  return { verified };
}
