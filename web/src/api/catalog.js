import { request } from "./client.js";

/** The whole catalog, revalidating its ETag on every load. */
export function getCatalog(options) {
  return request("/api/catalog", { cache: "no-cache", ...options });
}

/** `{ entry, detail }` for one title; `type` is `movie` or `series`. */
export function getTitle(type, id, options) {
  return request(`/api/titles/${type}/${id}`, { cache: "no-cache", ...options });
}
