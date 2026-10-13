import { audit } from "./audit.js";
import { HttpError, json } from "./http.js";
import { sameSecret } from "./secrets.js";

export const MAX_PASSWORD_FAILURES = 5;
export const PASSWORD_WINDOW_MS = 3600e3;

function userId(raw) {
  const id = /^\d{1,15}$/.test(String(raw)) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "not a Telegram user id");
  return id;
}

/**
 * Turns a signed-in user into a member when they give the shared write
 * password. Wrong guesses are limited per user and per hour; a right one
 * clears them.
 */
export async function unlock(env, user, body, now = Date.now()) {
  if (user.member) return json(user);
  if (!env.WRITE_PASSWORD) throw new HttpError(503, "the write password is not configured");
  const db = env.DB;
  const since = now - PASSWORD_WINDOW_MS;
  const { failures } = await db.prepare("SELECT COUNT(*) AS failures FROM password_failures WHERE user_id = ? AND at > ?")
    .bind(user.id, since)
    .first();
  if (failures >= MAX_PASSWORD_FAILURES) throw new HttpError(429, "too many wrong passwords, try again later");
  if (!(await sameSecret(body.password, env.WRITE_PASSWORD))) {
    await db.batch([
      db.prepare("DELETE FROM password_failures WHERE at <= ?").bind(since),
      db.prepare("INSERT INTO password_failures (user_id, at) VALUES (?, ?)").bind(user.id, now),
    ]);
    throw new HttpError(403, "wrong password");
  }
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO members (user_id, name, created_at) VALUES (?, ?, ?)").bind(user.id, user.name, now),
    db.prepare("DELETE FROM password_failures WHERE user_id = ?").bind(user.id),
    audit(db, user, "grant", `member:${user.id}`, undefined, { name: user.name, via: "password" }, now),
  ]);
  return json({ ...user, member: true });
}

export async function listMembers(db) {
  const { results } = await db.prepare("SELECT user_id, name, created_at FROM members ORDER BY created_at").all();
  return json(results.map((r) => ({ id: r.user_id, name: r.name ?? "", since: r.created_at })));
}

export async function revokeMember(db, admin, rawId, now = Date.now()) {
  const id = userId(rawId);
  const row = await db.prepare("SELECT name FROM members WHERE user_id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "not a member");
  await db.batch([
    db.prepare("DELETE FROM members WHERE user_id = ?").bind(id),
    audit(db, admin, "revoke", `member:${id}`, { name: row.name ?? "" }, undefined, now),
  ]);
  return new Response(null, { status: 204 });
}

export async function listAdmins(db) {
  const { results } = await db.prepare("SELECT user_id, name, created_at FROM admins ORDER BY created_at").all();
  return json(results.map((r) => ({ id: r.user_id, name: r.name ?? "", since: r.created_at })));
}

/** Makes someone who has already signed in and unlocked writing an admin; their name comes from `members`. */
export async function addAdmin(db, admin, rawId, now = Date.now()) {
  const id = userId(rawId);
  const member = await db.prepare("SELECT name FROM members WHERE user_id = ?").bind(id).first();
  if (!member) throw new HttpError(404, "only members can become admins");
  await db.batch([
    db.prepare(
      "INSERT INTO audit (at, user_id, action, target, before, after) SELECT ?, ?, 'grant', ?, NULL, ? WHERE NOT EXISTS (SELECT 1 FROM admins WHERE user_id = ?)",
    ).bind(now, admin.id, `admin:${id}`, JSON.stringify({ name: member.name ?? "" }), id),
    db.prepare("INSERT OR IGNORE INTO admins (user_id, name, added_by, created_at) VALUES (?, ?, ?, ?)").bind(id, member.name, admin.id, now),
  ]);
  return new Response(null, { status: 204 });
}

export async function removeAdmin(db, admin, rawId, now = Date.now()) {
  const id = userId(rawId);
  if (id === admin.id) throw new HttpError(400, "an admin cannot remove themselves");
  const row = await db.prepare("SELECT name FROM admins WHERE user_id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "not an admin");
  await db.batch([
    db.prepare("DELETE FROM admins WHERE user_id = ?").bind(id),
    audit(db, admin, "revoke", `admin:${id}`, { name: row.name ?? "" }, undefined, now),
  ]);
  return new Response(null, { status: 204 });
}
