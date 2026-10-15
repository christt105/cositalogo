import { request } from "./client.js";

/** The signed-in user, `{ id, name, member, admin }`; rejects with a 401 when there is no session. */
export function getMe(options) {
  return request("/api/me", options);
}

/** Starts a sign-in: `{ url, expiresAt }`, the bot link to open and when it stops working. */
export function startLogin(options) {
  return request("/api/login", { method: "POST", ...options });
}

/** `{ pending: true }` while the bot has not seen the link, then the user; rejects with a 410 once it expired. */
export function pollLogin(options) {
  return request("/api/login/poll", { method: "POST", ...options });
}

export function logout(options) {
  return request("/api/logout", { method: "POST", ...options });
}

/** Sends the shared password; the user becomes a member. */
export function unlock(password, options) {
  return request("/api/unlock", { method: "POST", body: { password }, ...options });
}
