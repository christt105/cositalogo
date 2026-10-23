import { request } from "./client.js";

/** Open requests, most wanted first, then the ones the catalog answered lately; members only. */
export function listRequests(options) {
  return request("/api/requests", { cache: "no-store", ...options });
}

/** Asks for `{ type, tmdb, season?, note? }`, or votes for the same open request; resolves to the request. */
export function addRequest(body, options) {
  return request("/api/requests", { method: "POST", body, ...options });
}

export function voteRequest(id, options) {
  return request(`/api/requests/${id}/vote`, { method: "PUT", ...options });
}

export function unvoteRequest(id, options) {
  return request(`/api/requests/${id}/vote`, { method: "DELETE", ...options });
}

export function deleteRequest(id, options) {
  return request(`/api/requests/${id}`, { method: "DELETE", ...options });
}
