import { json } from "./http.js";

const HASHED_CACHE = "public, max-age=31536000, immutable";

/**
 * Serves a hashed build file from `/assets/` with long-lived caching. A miss
 * is a JSON 404 with `no-store` instead of the single-page fallback, so a
 * request that lands on an older deploy can never cache `index.html` under a
 * script URL for a year.
 */
export async function serveAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const type = response.headers.get("content-type") ?? "";
  const found = response.status === 304 || (response.ok && !type.startsWith("text/html"));
  if (!found) return json({ error: "not found" }, 404, { "cache-control": "no-store" });
  const headers = new Headers(response.headers);
  headers.set("cache-control", HASHED_CACHE);
  return new Response(response.body, { status: response.status, headers });
}
