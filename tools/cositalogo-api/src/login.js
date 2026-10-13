import { HttpError, json } from "./http.js";
import { randomToken, sameSecret, sha256 } from "./secrets.js";
import { SESSION_COOKIE, SESSION_TTL_MS, cookieValue, loadUser, setCookie, signSession } from "./session.js";

export const LOGIN_COOKIE = "l";
const LOGIN_PATH = "/api/login";
export const LOGIN_TTL_MS = 5 * 60e3;
export const MAX_PENDING_LOGINS = 500;
const START = /^\/start login_([A-Za-z0-9_-]{22})$/;

const clearLoginCookie = () => setCookie(LOGIN_COOKIE, "", { path: LOGIN_PATH, maxAgeSeconds: 0 });

/**
 * Starts a sign-in: stores a one-use nonce and answers with the bot deep link
 * that carries it. The browser also gets a secret in a cookie, so whoever
 * sees the link cannot claim the session it opens.
 */
export async function startLogin(env, now = Date.now()) {
  if (!env.BOT_USERNAME) throw new HttpError(503, "the Telegram bot is not configured");
  await env.DB.prepare("DELETE FROM login_requests WHERE expires_at <= ?").bind(now).run();
  const { pending } = await env.DB.prepare("SELECT COUNT(*) AS pending FROM login_requests").first();
  if (pending >= MAX_PENDING_LOGINS) throw new HttpError(429, "too many sign-ins in progress, try again in a few minutes");
  const nonce = randomToken(16);
  const secret = randomToken(32);
  await env.DB.prepare("INSERT INTO login_requests (nonce, browser_hash, expires_at) VALUES (?, ?, ?)")
    .bind(nonce, await sha256(secret), now + LOGIN_TTL_MS)
    .run();
  const headers = {
    "set-cookie": setCookie(LOGIN_COOKIE, `${nonce}.${secret}`, { path: LOGIN_PATH, maxAgeSeconds: LOGIN_TTL_MS / 1000 }),
  };
  return json({ url: `https://t.me/${env.BOT_USERNAME}?start=login_${nonce}`, expiresAt: now + LOGIN_TTL_MS }, 201, headers);
}

/**
 * Polled by the browser that started the sign-in: 202 while the user has not
 * pressed Start in the bot, the session cookie once they have, 410 when the
 * request is gone, expired or belongs to another browser.
 */
export async function pollLogin(request, env, now = Date.now()) {
  const [nonce, secret] = (cookieValue(request, LOGIN_COOKIE) ?? "").split(".");
  const row = nonce
    ? await env.DB.prepare("SELECT * FROM login_requests WHERE nonce = ?").bind(nonce).first()
    : null;
  if (!row || row.expires_at <= now || !(await sameSecret(await sha256(secret ?? ""), row.browser_hash))) {
    return json({ error: "this sign-in expired, start again" }, 410, { "set-cookie": clearLoginCookie() });
  }
  if (row.user_id === null) return json({ pending: true }, 202);
  const claimed = await env.DB.prepare("DELETE FROM login_requests WHERE nonce = ? AND user_id IS NOT NULL").bind(nonce).run();
  if (claimed.meta.changes !== 1) {
    return json({ error: "this sign-in expired, start again" }, 410, { "set-cookie": clearLoginCookie() });
  }
  if (!env.SESSION_SECRET) throw new HttpError(503, "sessions are not configured");
  const token = await signSession({ uid: row.user_id, name: row.name, exp: now + SESSION_TTL_MS }, env.SESSION_SECRET);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  headers.append("set-cookie", setCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_MS / 1000 }));
  headers.append("set-cookie", clearLoginCookie());
  return new Response(JSON.stringify(await loadUser(env.DB, row.user_id, row.name)), { status: 200, headers });
}

export function logout() {
  return new Response(null, { status: 204, headers: { "set-cookie": setCookie(SESSION_COOKIE, "", { maxAgeSeconds: 0 }) } });
}

function displayName(from) {
  const full = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return (full || from.username || String(from.id)).slice(0, 100);
}

const reply = (chatId, text) => json({ method: "sendMessage", chat_id: chatId, text });

/**
 * Telegram webhook of the Cositálogo bot. Only private chats are answered,
 * through the webhook response itself, so the Worker never needs the bot
 * token. `/start login_<nonce>` confirms a pending sign-in as the sender.
 */
export async function telegramWebhook(request, env, now = Date.now()) {
  if (!(await sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET))) {
    throw new HttpError(401, "bad webhook secret");
  }
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response(null, { status: 200 });
  }
  const message = update?.message;
  const from = message?.from;
  if (message?.chat?.type !== "private" || !from || from.is_bot || !Number.isSafeInteger(from.id)) {
    return new Response(null, { status: 200 });
  }
  const match = START.exec(typeof message.text === "string" ? message.text.trim() : "");
  if (!match) return reply(message.chat.id, "Para entrar en el Cositálogo, usa el botón de la web.");
  const confirmed = await env.DB.prepare(
    "UPDATE login_requests SET user_id = ?, name = ? WHERE nonce = ? AND user_id IS NULL AND expires_at > ?",
  ).bind(from.id, displayName(from), match[1], now).run();
  return confirmed.meta.changes === 1
    ? reply(message.chat.id, "Listo, ya puedes volver a la web del Cositálogo.")
    : reply(message.chat.id, "Este enlace ya se usó o ha caducado. Pide uno nuevo desde la web.");
}
