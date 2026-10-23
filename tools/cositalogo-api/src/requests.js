import { HttpError } from "./http.js";
import { parseTarget } from "./links.js";
import { fetchSeason, fetchTitle } from "./tmdb.js";

export const MAX_NOTE_LENGTH = 200;
export const FULFILLED_DAYS = 30;
const MAX_SEASON = 999;

/**
 * The time of the first link added to the catalog, after the request, that
 * answers it: any link of the title for a movie or a whole series, a link of
 * that season or of every season for a season.
 */
const FULFILLED_AT =
  "(SELECT min(l.created_at) FROM links l WHERE l.type = r.type AND l.tmdb_id = r.tmdb_id AND l.created_at >= r.created_at " +
  "AND (r.season IS NULL OR l.season = CAST(r.season AS TEXT) OR l.season = 'all'))";

const SELECT_REQUESTS =
  "SELECT r.*, coalesce(m.name, ad.name) AS requester_name, " +
  "(SELECT COUNT(*) FROM request_votes v WHERE v.request_id = r.id) AS votes, " +
  "EXISTS (SELECT 1 FROM request_votes v WHERE v.request_id = r.id AND v.user_id = ?) AS voted, " +
  `${FULFILLED_AT} AS fulfilled_at ` +
  "FROM requests r LEFT JOIN members m ON m.user_id = r.requested_by LEFT JOIN admins ad ON ad.user_id = r.requested_by";

function requestView(row, user) {
  return {
    id: row.id,
    type: row.type,
    tmdb: row.tmdb_id,
    ...(row.season === null ? {} : { season: row.season, seasonName: row.season_name ?? `Temporada ${row.season}` }),
    title: row.title,
    year: row.year,
    poster: row.poster,
    note: row.note ?? "",
    requestedBy: { id: row.requested_by, name: row.requester_name ?? null },
    createdAt: row.created_at,
    votes: row.votes,
    voted: Boolean(row.voted),
    canDelete: user.admin || row.requested_by === user.id,
    fulfilledAt: row.fulfilled_at ?? null,
  };
}

function requestId(raw) {
  if (!/^\d{1,12}$/.test(String(raw))) throw new HttpError(404, "no such request");
  return Number(raw);
}

function parseSeason(type, season) {
  if (season === undefined || season === null) return null;
  if (type !== "series") throw new HttpError(400, "season is only for series");
  if (!Number.isInteger(season) || season < 0 || season > MAX_SEASON) throw new HttpError(400, "season must be an integer >= 0");
  return season;
}

function parseNote(note) {
  if (note === undefined || note === null) return null;
  if (typeof note !== "string") throw new HttpError(400, "note must be a string");
  const clean = note.replace(/[\p{Cc}\p{Cf}]+/gu, " ").replace(/\s+/g, " ").trim();
  if (clean.length > MAX_NOTE_LENGTH) throw new HttpError(400, `note must be at most ${MAX_NOTE_LENGTH} characters`);
  return clean || null;
}

async function getRequest(db, user, id) {
  const row = await db.prepare(`${SELECT_REQUESTS} WHERE r.id = ?`).bind(user.id, requestId(id)).first();
  if (!row) throw new HttpError(404, "no such request");
  return row;
}

/**
 * The open requests, most wanted first, then those the catalog answered in
 * the last `FULFILLED_DAYS` days, most recently answered first.
 */
export async function listRequests(db, user, now = Date.now()) {
  const since = now - FULFILLED_DAYS * 24 * 3600e3;
  const { results } = await db.prepare(
    `SELECT * FROM (${SELECT_REQUESTS}) WHERE fulfilled_at IS NULL OR fulfilled_at >= ? ` +
      "ORDER BY fulfilled_at IS NOT NULL, fulfilled_at DESC, votes DESC, created_at DESC, id DESC"
  ).bind(user.id, since).all();
  return results.map((row) => requestView(row, user));
}

/**
 * Asks for a movie, a whole series or one season. When the same thing is
 * already asked for and not yet answered, adds this user's vote to it
 * instead (200); a new request (201) takes its title, year and poster from
 * TMDB and counts its author's vote.
 */
export async function addRequest(env, user, body, now = Date.now()) {
  const db = env.DB;
  const { type, tmdbId } = parseTarget(body.type, body.tmdb);
  const season = parseSeason(type, body.season);
  const note = parseNote(body.note);
  const open = await db.prepare(
    `SELECT id FROM (${SELECT_REQUESTS}) WHERE type = ? AND tmdb_id = ? AND season IS ? AND fulfilled_at IS NULL ORDER BY id LIMIT 1`
  ).bind(user.id, type, tmdbId, season).first();
  if (open) {
    await vote(db, user, open.id, now);
    return { status: 200, request: requestView(await getRequest(db, user, open.id), user) };
  }
  const title = await fetchTitle(env, type, tmdbId);
  const info = season === null ? null : await fetchSeason(env, tmdbId, season);
  if (season !== null && !info) throw new HttpError(422, `TMDB has no season ${season} of series ${tmdbId}`);
  const [inserted] = await db.batch([
    db.prepare(
      "INSERT INTO requests (type, tmdb_id, season, title, season_name, year, poster, note, requested_by, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
    ).bind(type, tmdbId, season, title.title, info?.name ?? null, title.year, info?.poster ?? title.tmdb_poster, note, user.id, now),
    db.prepare("INSERT INTO request_votes (request_id, user_id, created_at) VALUES (last_insert_rowid(), ?, ?)").bind(user.id, now),
  ]);
  return { status: 201, request: requestView(await getRequest(db, user, inserted.results[0].id), user) };
}

export async function vote(db, user, id, now = Date.now()) {
  const row = await getRequest(db, user, id);
  await db.prepare("INSERT OR IGNORE INTO request_votes (request_id, user_id, created_at) VALUES (?, ?, ?)").bind(row.id, user.id, now).run();
}

export async function unvote(db, user, id) {
  const row = await getRequest(db, user, id);
  await db.prepare("DELETE FROM request_votes WHERE request_id = ? AND user_id = ?").bind(row.id, user.id).run();
}

/** Deletes a request and its votes; only its author or an admin may. */
export async function deleteRequest(db, user, id) {
  const row = await getRequest(db, user, id);
  if (!user.admin && row.requested_by !== user.id) throw new HttpError(403, "only an admin or whoever asked can do that");
  await db.batch([
    db.prepare("DELETE FROM request_votes WHERE request_id = ?").bind(row.id),
    db.prepare("DELETE FROM requests WHERE id = ?").bind(row.id),
  ]);
}
