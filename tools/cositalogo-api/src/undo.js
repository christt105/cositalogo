import { HttpError } from "./http.js";
import { deleteLink, linkView, moveLink, restoreLink, setPoster, updateLink } from "./links.js";

const LINK_KEYS = ["type", "tmdb", "season", "quality", "audio", "subs", "tags", "link"];

const parse = (text) => (text === null ? null : JSON.parse(text));
const sameLink = (a, b) => JSON.stringify(LINK_KEYS.map((k) => a?.[k] ?? null)) === JSON.stringify(LINK_KEYS.map((k) => b?.[k] ?? null));

async function currentLink(db, id) {
  const row = await db.prepare("SELECT * FROM links WHERE id = ?").bind(id).first();
  return row ? linkView(row) : null;
}

/** Fails with 409 unless the link is still exactly as the audited write left it. */
async function linkAsLeft(db, id, after) {
  const current = await currentLink(db, id);
  if (!current) throw new HttpError(409, "the link no longer exists");
  if (!sameLink(current, after)) throw new HttpError(409, "the link changed after this write; undo the later changes first");
}

/**
 * Undoes one audited write by making the opposite write, logged with
 * `reverts` pointing at it. Only works while the link or poster is still as
 * that write left it, and only once per row; undoing the undo redoes it.
 */
export async function undo(env, user, settings, auditId, now = Date.now()) {
  const db = env.DB;
  const row = await db.prepare("SELECT * FROM audit WHERE id = ?").bind(Number(auditId)).first();
  if (!row) throw new HttpError(404, "no such audit entry");
  const done = await db.prepare("SELECT id FROM audit WHERE reverts = ?").bind(row.id).first();
  if (done) throw new HttpError(409, `already undone by audit entry ${done.id}`);
  const before = parse(row.before);
  const after = parse(row.after);
  const linkId = Number(/^link:(\d+)$/.exec(row.target)?.[1]);

  switch (row.action) {
    case "add":
      await linkAsLeft(db, linkId, after);
      await deleteLink(env, user, settings, linkId, now, row.id);
      break;
    case "update":
      await linkAsLeft(db, linkId, after);
      await updateLink(env, user, settings, linkId, {
        season: before.season ?? null, quality: before.quality, audio: before.audio, subs: before.subs, tags: before.tags, link: before.link,
      }, now, row.id);
      break;
    case "move":
      await linkAsLeft(db, linkId, after);
      await moveLink(env, user, settings, linkId, { type: before.type, tmdb: before.tmdb, season: before.season }, now, row.id);
      break;
    case "delete": {
      const current = await currentLink(db, before.id);
      if (current && sameLink(current, before)) throw new HttpError(409, "the link is already back");
      await restoreLink(env, user, settings, before, now, row.id);
      break;
    }
    case "poster": {
      const [, type, tmdb, season] = /^(movie|series):(\d+)(?::(.+))?$/.exec(row.target);
      const title = await db.prepare("SELECT poster, season_posters FROM titles WHERE type = ? AND tmdb_id = ?").bind(type, Number(tmdb)).first();
      if (!title) throw new HttpError(409, "the title no longer exists");
      const current = season === undefined ? title.poster : JSON.parse(title.season_posters)[season] ?? null;
      if (current !== after) throw new HttpError(409, "the poster changed after this write; undo the later changes first");
      await setPoster(env, user, settings, type, Number(tmdb), { poster: before, season }, now, row.id);
      break;
    }
    default:
      throw new HttpError(400, `a ${row.action} cannot be undone from here`);
  }
  return db.prepare("SELECT id FROM audit WHERE reverts = ?").bind(row.id).first();
}
