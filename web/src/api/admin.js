import { request } from "./client.js";

/** A page of the audit log, newest first: `{ entries, more }`; `before` continues a page, `title` (`movie:603`) keeps one title. */
export function getAudit({ before, title } = {}, options) {
  const query = new URLSearchParams();
  if (before) query.set("before", before);
  if (title) query.set("title", title);
  const qs = query.toString();
  return request(`/api/audit${qs ? `?${qs}` : ""}`, { cache: "no-cache", ...options });
}

/** Undoes one audited write; resolves to `{ id }` of the row that undid it. */
export function undoAudit(id, options) {
  return request(`/api/audit/${id}/undo`, { method: "POST", body: {}, ...options });
}

/** `[{ id, name, since }]` of everyone who unlocked writing. */
export function getMembers(options) {
  return request("/api/members", { cache: "no-cache", ...options });
}

/** `[{ id, name, since }]` of the admins. */
export function getAdmins(options) {
  return request("/api/admins", { cache: "no-cache", ...options });
}

export function revokeMember(id, options) {
  return request(`/api/members/${id}`, { method: "DELETE", ...options });
}

export function addAdmin(id, options) {
  return request(`/api/admins/${id}`, { method: "PUT", ...options });
}

export function removeAdmin(id, options) {
  return request(`/api/admins/${id}`, { method: "DELETE", ...options });
}
