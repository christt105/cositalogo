import { HttpError } from "./http.js";

const asJson = (value) => (value === undefined ? null : JSON.stringify(value));
const parse = (text) => (text === null ? null : JSON.parse(text));

const PAGE = 50;

/**
 * The statement that records one write in the `audit` table, to run in the
 * same batch as the write itself. `reverts` is the id of the audit row this
 * write undoes.
 */
export function audit(db, user, action, target, before, after, now, reverts = null) {
  return db.prepare("INSERT INTO audit (at, user_id, action, target, before, after, reverts) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(now, user.id, action, target, asJson(before), asJson(after), reverts);
}

/**
 * A page of the audit log, newest first: `before` is the id to continue
 * after, `title` (`movie:603`) keeps the rows about one title and its links.
 * Each row carries the author's name and `undoneBy`, the id of the row that
 * undid it.
 */
export async function listAudit(db, url) {
  const params = url.searchParams;
  const where = [];
  const binds = [];
  const before = params.get("before");
  if (before !== null) {
    if (!/^\d{1,12}$/.test(before)) throw new HttpError(400, "before must be an audit id");
    where.push("a.id < ?");
    binds.push(Number(before));
  }
  const title = params.get("title");
  if (title !== null) {
    const match = /^(movie|series):(\d{1,9})$/.exec(title);
    if (!match) throw new HttpError(400, 'title must look like "movie:603"');
    const [, type, id] = match;
    where.push(
      "(a.target = ? OR a.target LIKE ? " +
        "OR (json_extract(a.before, '$.type') = ? AND json_extract(a.before, '$.tmdb') = ?) " +
        "OR (json_extract(a.after, '$.type') = ? AND json_extract(a.after, '$.tmdb') = ?))"
    );
    binds.push(title, `${title}:%`, type, Number(id), type, Number(id));
  }
  const limit = Math.min(Math.max(Number(params.get("limit")) || PAGE, 1), 200);
  const { results } = await db.prepare(
    "SELECT a.*, coalesce(m.name, ad.name) AS user_name, (SELECT u.id FROM audit u WHERE u.reverts = a.id) AS undone_by " +
      "FROM audit a LEFT JOIN members m ON m.user_id = a.user_id LEFT JOIN admins ad ON ad.user_id = a.user_id " +
      `${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.id DESC LIMIT ?`
  ).bind(...binds, limit + 1).all();
  return {
    entries: results.slice(0, limit).map((row) => ({
      id: row.id,
      at: row.at,
      user: { id: row.user_id, name: row.user_name ?? null },
      action: row.action,
      target: row.target,
      before: parse(row.before),
      after: parse(row.after),
      reverts: row.reverts ?? null,
      undoneBy: row.undone_by ?? null,
    })),
    more: results.length > limit,
  };
}
