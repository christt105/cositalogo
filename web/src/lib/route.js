/** Splits a `#/path?query` hash into its path segments and query parameters. */
export function parseHash(hash) {
  const body = hash.startsWith("#/") ? hash.slice(2) : "";
  const [path, query = ""] = body.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query) };
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

/**
 * The first route whose `path` (`/`, `/movie/:id`) has the same segments as
 * `parts`, with each `:name` captured. A route can restrict a capture with a
 * regular expression in `match`. Null when no route fits.
 */
export function matchRoute(routes, parts) {
  for (const route of routes) {
    const segments = route.path.split("/").filter(Boolean);
    if (segments.length !== parts.length) continue;
    const params = {};
    const fits = segments.every((segment, i) => {
      if (!segment.startsWith(":")) return segment === parts[i];
      const name = segment.slice(1);
      if (route.match?.[name] && !route.match[name].test(parts[i])) return false;
      params[name] = parts[i];
      return true;
    });
    if (fits) return { route, params };
  }
  return null;
}
