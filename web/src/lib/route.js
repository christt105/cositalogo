/** A router query (`{ key: value | value[] }`) as URLSearchParams, the shape the views read. */
export function queryParams(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    for (const v of [value].flat()) if (v != null) params.append(key, v);
  }
  return params;
}

/** A hash with `next` in its query, for screens that send the user back where they were. */
export function withNext(path, next) {
  return next && next !== "/" ? `#${path}?${new URLSearchParams({ next })}` : `#${path}`;
}

/** The `next` path of a query, `/` when it is missing or does not look like a path of this app. */
export function nextPath(params) {
  const next = params.get("next") ?? "";
  return next.startsWith("/") ? next : "/";
}

/** The grid's hash for a search, `#/` when there is none. */
export function gridHash(q) {
  return q ? `#/?${new URLSearchParams({ q })}` : "#/";
}
