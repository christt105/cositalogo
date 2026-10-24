import { ValidationError, validateLinkEntry, validatePoster } from "./validation.js";
import { linkKey, withoutReviewTags } from "../../../shared/rules.js";
import { audit } from "./audit.js";
import { refreshTitle, seasonValue } from "./catalog.js";
import { HttpError } from "./http.js";
import { fetchSeason, fetchTitle } from "./tmdb.js";

const TYPES = new Set(["movie", "series"]);
const LINK_FIELDS = ["season", "quality", "audio", "subs", "tags", "link"];

const parse = (text, fallback) => (text ? JSON.parse(text) : fallback);

export function parseTarget(type, tmdb) {
  const id = typeof tmdb === "string" && /^\d{1,9}$/.test(tmdb) ? Number(tmdb) : tmdb;
  if (!TYPES.has(type)) throw new HttpError(400, 'type must be "movie" or "series"');
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "tmdb must be a positive integer");
  return { type, tmdbId: id };
}

/** A link as the API exposes it and as the audit log records it. */
export function linkView(row) {
  return {
    id: row.id,
    type: row.type,
    tmdb: row.tmdb_id,
    ...(row.season === null ? {} : { season: seasonValue(row.season) }),
    quality: row.quality,
    audio: parse(row.audio, []),
    subs: parse(row.subs, []),
    tags: parse(row.tags, []),
    link: row.url,
  };
}

/** Validates a link with the same rules the YAML files follow and returns its column values. */
function linkColumns(input, type, settings) {
  const entry = {};
  for (const field of LINK_FIELDS) if (input[field] !== undefined && input[field] !== null) entry[field] = input[field];
  try {
    validateLinkEntry(entry, { type, ...settings });
  } catch (err) {
    if (err instanceof ValidationError) throw new HttpError(400, err.message);
    throw err;
  }
  return {
    season: entry.season === undefined ? null : String(entry.season),
    quality: entry.quality,
    audio: JSON.stringify(entry.audio ?? []),
    subs: JSON.stringify(entry.subs ?? []),
    tags: JSON.stringify(entry.tags ?? []),
    url: entry.link,
    link_key: linkKey(entry.link),
  };
}

function viewOf(base, cols) {
  return linkView({ ...base, ...cols });
}

async function getLink(db, id) {
  if (!/^\d{1,12}$/.test(String(id))) throw new HttpError(404, "no such link");
  const row = await db.prepare("SELECT * FROM links WHERE id = ?").bind(Number(id)).first();
  if (!row) throw new HttpError(404, "no such link");
  return row;
}

async function assertKeyFree(db, key, exceptId = null) {
  const clash = await db.prepare("SELECT id, type, tmdb_id FROM links WHERE link_key = ?").bind(key).first();
  if (clash && clash.id !== exceptId) {
    throw new HttpError(409, `that Telegram message is already link ${clash.id} of ${clash.type}:${clash.tmdb_id}`);
  }
}

function assertCanRemove(user, row) {
  if (!user.admin && row.added_by !== user.id) throw new HttpError(403, "only an admin or whoever added the link can do that");
}

/**
 * Statements that make sure a title (and the season a link points at)
 * exists, fetching what is missing from TMDB first so the writes that
 * follow can go in a single transaction.
 */
async function prepareTitle(env, type, tmdbId, season, now) {
  const db = env.DB;
  const stmts = [];
  let row = await db.prepare("SELECT * FROM titles WHERE type = ? AND tmdb_id = ?").bind(type, tmdbId).first();
  stmts.created = !row;
  if (!row) {
    const t = await fetchTitle(env, type, tmdbId);
    row = { seasons: "{}", detail: JSON.stringify(t.detail) };
    stmts.push(
      db.prepare(
        "INSERT INTO titles (type, tmdb_id, imdb, title, original_title, english_title, year, tmdb_poster, genres, detail, created_at, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (type, tmdb_id) DO NOTHING"
      ).bind(type, tmdbId, t.imdb, t.title, t.original_title, t.english_title, t.year, t.tmdb_poster, JSON.stringify(t.genres), row.detail, now, now)
    );
  }
  if (type === "series" && season !== null && season !== "all") {
    const seasons = parse(row.seasons, {});
    if (!seasons[season]) {
      const info = await fetchSeason(env, tmdbId, season).catch(() => null);
      if (info) {
        const detail = parse(row.detail, {});
        detail.seasons = { ...detail.seasons, [season]: { episodeCount: info.episodeCount, airDate: info.airDate } };
        stmts.push(
          db.prepare("UPDATE titles SET seasons = json_set(seasons, ?, json(?)), detail = ? WHERE type = ? AND tmdb_id = ?")
            .bind(`$."${season}"`, JSON.stringify(info), JSON.stringify(detail), type, tmdbId)
        );
      }
    }
  }
  return stmts;
}

function dropIfEmpty(db, type, tmdbId) {
  return db.prepare("DELETE FROM titles WHERE type = ? AND tmdb_id = ? AND NOT EXISTS (SELECT 1 FROM links WHERE type = ? AND tmdb_id = ?)")
    .bind(type, tmdbId, type, tmdbId);
}

/**
 * The links of a title with their ids, in catalog order, for a signed-in
 * user; `canDelete` says whether this user may delete or move each one.
 */
export async function listTitleLinks(db, user, type, tmdbId) {
  const { results } = await db.prepare("SELECT * FROM links WHERE type = ? AND tmdb_id = ? ORDER BY id").bind(type, tmdbId).all();
  if (results.length === 0) throw new HttpError(404, "not found");
  return results.map((row) => ({ ...linkView(row), canDelete: user.admin || row.added_by === user.id }));
}

export async function addLink(env, user, settings, body, now = Date.now()) {
  const { type, tmdbId } = parseTarget(body.type, body.tmdb);
  const cols = linkColumns(body, type, settings);
  const poster = body.poster ?? null;
  if (poster !== null) checkPoster(poster);
  await assertKeyFree(env.DB, cols.link_key);
  const db = env.DB;
  const stmts = await prepareTitle(env, type, tmdbId, cols.season, now);
  if (poster !== null) {
    if (!stmts.created) throw new HttpError(409, "the title is already in the catalog; change its poster with PUT /api/titles/:type/:id/poster");
    stmts.push(
      db.prepare("UPDATE titles SET poster = ? WHERE type = ? AND tmdb_id = ? AND poster IS NULL").bind(poster, type, tmdbId),
      audit(db, user, "poster", `${type}:${tmdbId}`, null, poster, now)
    );
  }
  stmts.push(
    db.prepare(
      "INSERT INTO links (type, tmdb_id, season, quality, audio, subs, tags, url, link_key, added_by, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
    ).bind(type, tmdbId, cols.season, cols.quality, cols.audio, cols.subs, cols.tags, cols.url, cols.link_key, user.id, now, now)
  );
  const after = viewOf({ type, tmdb_id: tmdbId }, cols);
  delete after.id;
  stmts.push(
    db.prepare("INSERT INTO audit (at, user_id, action, target, before, after) SELECT ?, ?, 'add', 'link:' || id, NULL, ? FROM links WHERE link_key = ?")
      .bind(now, user.id, JSON.stringify(after), cols.link_key)
  );
  const results = await runWrites(db, stmts);
  const link = linkView(results.at(-2).results[0]);
  await refreshTitle(db, type, tmdbId, settings, now);
  return link;
}

export async function updateLink(env, user, settings, id, body, now = Date.now(), reverts = null) {
  const db = env.DB;
  const row = await getLink(db, id);
  const before = linkView(row);
  const merged = { ...before };
  for (const field of LINK_FIELDS) if (field in body) merged[field] = body[field];
  if (row.type === "movie") delete merged.season;
  const cols = linkColumns(merged, row.type, settings);
  await assertKeyFree(db, cols.link_key, row.id);
  const stmts = await prepareTitle(env, row.type, row.tmdb_id, cols.season, now);
  stmts.push(
    db.prepare(
      "UPDATE links SET season = ?, quality = ?, audio = ?, subs = ?, tags = ?, url = ?, link_key = ?, updated_at = ? WHERE id = ?"
    ).bind(cols.season, cols.quality, cols.audio, cols.subs, cols.tags, cols.url, cols.link_key, Math.max(now, row.updated_at + 1), row.id)
  );
  const after = viewOf(row, cols);
  stmts.push(audit(db, user, "update", `link:${row.id}`, before, after, now, reverts));
  await runWrites(db, stmts);
  await refreshTitle(db, row.type, row.tmdb_id, settings, now);
  return after;
}

export async function deleteLink(env, user, settings, id, now = Date.now(), reverts = null) {
  const db = env.DB;
  const row = await getLink(db, id);
  assertCanRemove(user, row);
  const before = { ...linkView(row), addedBy: row.added_by, createdAt: row.created_at };
  await db.batch([
    db.prepare("DELETE FROM links WHERE id = ?").bind(row.id),
    audit(db, user, "delete", `link:${row.id}`, before, undefined, now, reverts),
    dropIfEmpty(db, row.type, row.tmdb_id),
  ]);
  await refreshTitle(db, row.type, row.tmdb_id, settings, now);
}

/** Moves a link to another title (and season), as reidentify does today, dropping the old title once it has no links. Moving is a person saying which title it is, so the review tags go. */
export async function moveLink(env, user, settings, id, body, now = Date.now(), reverts = null) {
  const db = env.DB;
  const row = await getLink(db, id);
  assertCanRemove(user, row);
  const { type, tmdbId } = parseTarget(body.type, body.tmdb);
  const before = linkView(row);
  const target = { ...before, season: type === "series" ? body.season : undefined, tags: withoutReviewTags(before.tags) };
  const cols = linkColumns(target, type, settings);
  const stmts = await prepareTitle(env, type, tmdbId, cols.season, now);
  stmts.push(
    db.prepare("UPDATE links SET type = ?, tmdb_id = ?, season = ?, tags = ?, updated_at = ? WHERE id = ?")
      .bind(type, tmdbId, cols.season, cols.tags, Math.max(now, row.updated_at + 1), row.id)
  );
  const after = viewOf(row, { type, tmdb_id: tmdbId, season: cols.season, tags: cols.tags });
  stmts.push(audit(db, user, "move", `link:${row.id}`, before, after, now, reverts), dropIfEmpty(db, row.type, row.tmdb_id));
  await runWrites(db, stmts);
  await refreshTitle(db, row.type, row.tmdb_id, settings, now);
  await refreshTitle(db, type, tmdbId, settings, now);
  return after;
}

/**
 * Puts back a deleted link from the `before` its delete logged, keeping its
 * id (and so its place) when no other link took it, its author and its
 * creation time. A title that went with it is fetched from TMDB again.
 */
export async function restoreLink(env, user, settings, before, now = Date.now(), reverts = null) {
  const db = env.DB;
  const { type, tmdbId } = parseTarget(before.type, before.tmdb);
  const cols = linkColumns(before, type, settings);
  await assertKeyFree(db, cols.link_key);
  const taken = await db.prepare("SELECT 1 FROM links WHERE id = ?").bind(before.id).first();
  const addedBy = "addedBy" in before
    ? before.addedBy
    : (await db.prepare("SELECT user_id FROM audit WHERE action = 'add' AND target = ? ORDER BY id LIMIT 1").bind(`link:${before.id}`).first())?.user_id ?? null;
  const stmts = await prepareTitle(env, type, tmdbId, cols.season, now);
  stmts.push(
    db.prepare(
      "INSERT INTO links (id, type, tmdb_id, season, quality, audio, subs, tags, url, link_key, added_by, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
    ).bind(taken ? null : before.id, type, tmdbId, cols.season, cols.quality, cols.audio, cols.subs, cols.tags, cols.url, cols.link_key, addedBy, before.createdAt ?? now, now)
  );
  const after = viewOf({ type, tmdb_id: tmdbId }, cols);
  delete after.id;
  stmts.push(
    db.prepare("INSERT INTO audit (at, user_id, action, target, before, after, reverts) SELECT ?, ?, 'add', 'link:' || id, NULL, ?, ? FROM links WHERE link_key = ?")
      .bind(now, user.id, JSON.stringify(after), reverts, cols.link_key)
  );
  const results = await runWrites(db, stmts);
  const link = linkView(results.at(-2).results[0]);
  await refreshTitle(db, type, tmdbId, settings, now);
  return link;
}

/** Sets or, with `poster: null`, clears the manual poster of a title or of one of its seasons. */
export async function setPoster(env, user, settings, type, tmdbId, body, now = Date.now(), reverts = null) {
  const db = env.DB;
  const row = await db.prepare("SELECT * FROM titles WHERE type = ? AND tmdb_id = ?").bind(type, tmdbId).first();
  if (!row) throw new HttpError(404, "no such title");
  const poster = body.poster ?? null;
  if (poster !== null) checkPoster(poster);
  const season = body.season === undefined || body.season === null ? null : String(body.season);
  if (season !== null && (type !== "series" || !/^(\d+|all)$/.test(season))) {
    throw new HttpError(400, 'season must be "all" or an integer, and only for series');
  }
  const target = `${type}:${tmdbId}`;
  const touched = Math.max(now, row.updated_at + 1);
  const update = season === null
    ? db.prepare("UPDATE titles SET poster = ?, updated_at = ? WHERE type = ? AND tmdb_id = ?").bind(poster, touched, type, tmdbId)
    : poster === null
      ? db.prepare("UPDATE titles SET season_posters = json_remove(season_posters, ?), updated_at = ? WHERE type = ? AND tmdb_id = ?")
          .bind(`$."${season}"`, touched, type, tmdbId)
      : db.prepare("UPDATE titles SET season_posters = json_set(season_posters, ?, ?), updated_at = ? WHERE type = ? AND tmdb_id = ?")
          .bind(`$."${season}"`, poster, touched, type, tmdbId);
  const before = season === null ? row.poster : parse(row.season_posters, {})[season] ?? null;
  await db.batch([update, audit(db, user, "poster", season === null ? target : `${target}:${season}`, before, poster, now, reverts)]);
  await refreshTitle(db, type, tmdbId, settings, now);
}

function checkPoster(poster) {
  try {
    validatePoster(poster);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
}

async function runWrites(db, stmts) {
  try {
    return await db.batch(stmts);
  } catch (err) {
    if (/UNIQUE constraint failed: links\.link_key/.test(String(err?.message))) {
      throw new HttpError(409, "that Telegram message is already in the catalog");
    }
    throw err;
  }
}

