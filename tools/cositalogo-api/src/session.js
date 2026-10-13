import { HttpError } from "./http.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export const SESSION_COOKIE = "s";

function toBase64Url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

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

/** The signed-in user with their role, or a 401 when the request carries no valid session. */
export async function requireUser(request, env) {
  const session = await readSession(cookieValue(request, SESSION_COOKIE), env.SESSION_SECRET);
  if (!session) throw new HttpError(401, "sign in first");
  const admin = await env.DB.prepare("SELECT 1 AS yes FROM admins WHERE user_id = ?").bind(session.uid).first();
  return { id: session.uid, name: session.name ?? "", admin: Boolean(admin) };
}
