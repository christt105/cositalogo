import { HttpError } from "./http.js";
import { fromBase64Url, toBase64Url } from "./secrets.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = "s";
export const SESSION_TTL_MS = 30 * 24 * 3600e3;

function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Signs `payload` (which must carry `uid` and an `exp` in ms) into a compact `<body>.<mac>` token. */
export async function signSession(payload, secret) {
  const body = toBase64Url(enc.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(mac))}`;
}

/** The payload of a valid, unexpired session token, or null. */
export async function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64Url(mac), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(fromBase64Url(body)));
    if (!Number.isSafeInteger(payload.uid) || !(payload.exp > now)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieValue(request, name) {
  for (const part of (request.headers.get("cookie") ?? "").split(/;\s*/)) {
    if (part.startsWith(`${name}=`)) return part.slice(name.length + 1);
  }
  return null;
}

/** A `Set-Cookie` value for an HttpOnly cookie; a `maxAgeSeconds` of 0 deletes it. */
export function setCookie(name, value, { path = "/", maxAgeSeconds }) {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

/** The signed-in user and what they may do, or a 401 when the request carries no valid session. */
export async function requireUser(request, env) {
  const session = await readSession(cookieValue(request, SESSION_COOKIE), env.SESSION_SECRET);
  if (!session) throw new HttpError(401, "sign in first");
  return loadUser(env.DB, session.uid, session.name);
}

/** A user with the roles D1 holds for them right now; an admin can always write. */
export async function loadUser(db, id, name) {
  const roles = await db.prepare(
    "SELECT EXISTS (SELECT 1 FROM members WHERE user_id = ?) AS member, EXISTS (SELECT 1 FROM admins WHERE user_id = ?) AS admin",
  ).bind(id, id).first();
  const admin = Boolean(roles.admin);
  return { id, name: name ?? "", member: admin || Boolean(roles.member), admin };
}

/** Like `requireUser`, but a 403 unless the user has unlocked writing with the password or is an admin. */
export async function requireWriter(request, env) {
  const user = await requireUser(request, env);
  if (!user.member) throw new HttpError(403, "enter the write password first");
  return user;
}

export async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (!user.admin) throw new HttpError(403, "admins only");
  return user;
}
