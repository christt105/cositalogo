import { request } from "./client.js";

/** The links of a title with their ids and `canDelete`; needs a session. */
export function getTitleLinks(type, id, options) {
  return request(`/api/titles/${type}/${id}/links`, { cache: "no-cache", ...options });
}

/** Adds `{ type, tmdb, season?, quality, audio, subs, tags, link }` and resolves to the new link. */
export function addLink(link, options) {
  return request("/api/links", { method: "POST", body: link, ...options });
}

/** Changes some of `season`, `quality`, `audio`, `subs`, `tags` and `link`. */
export function updateLink(id, changes, options) {
  return request(`/api/links/${id}`, { method: "PATCH", body: changes, ...options });
}

export function deleteLink(id, options) {
  return request(`/api/links/${id}`, { method: "DELETE", ...options });
}

/** Moves a link to `{ type, tmdb, season? }` and resolves to the moved link. */
export function moveLink(id, target, options) {
  return request(`/api/links/${id}/move`, { method: "POST", body: target, ...options });
}

/** Sets the manual poster of a title, or with `null` goes back to TMDB's. */
export function setPoster(type, id, poster, options) {
  return request(`/api/titles/${type}/${id}/poster`, { method: "PUT", body: { poster }, ...options });
}
