import { request } from "./client.js";

/** `{ qualities, groups, languages }`, the values a link is validated against. */
export function getSettings(options) {
  return request("/api/settings", options);
}
