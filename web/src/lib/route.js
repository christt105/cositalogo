/** A router query (`{ key: value | value[] }`) as URLSearchParams, the shape the views read. */
export function queryParams(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of [value].flat()) if (v != null) params.append(key, v);
  }
  return params;
}

/** A path with `next` in its query, for screens that send the user back where they were. */
export function withNext(path, next) {
  return next && next !== "/" ? `${path}?${new URLSearchParams({ next })}` : path;
}

/**
 * The `next` path of a query, `/` when it is missing or does not look like a
 * path of this app (`//host` and `/\host` would leave the site).
 */
export function nextPath(params) {
  const next = params.get("next") ?? "";
  return /^\/(?![/\\])/.test(next) ? next : "/";
}
