import { onBeforeUnmount, shallowRef } from "vue";

/** Splits a `#/path?query` hash into its path segments and query parameters. */
export function parseHash(hash) {
  const body = hash.startsWith("#/") ? hash.slice(2) : "";
  const [path, query = ""] = body.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(query) };
}

/** The grid's hash for a search, `#/` when there is none. */
export function gridHash(q) {
  return q ? `#/?${new URLSearchParams({ q })}` : "#/";
}

/** The current hash route, updated on every `hashchange` while the calling component is mounted. */
export function useHashRoute(win = window) {
  const route = shallowRef(parseHash(win.location.hash));
  const update = () => {
    route.value = parseHash(win.location.hash);
  };
  win.addEventListener("hashchange", update);
  onBeforeUnmount(() => win.removeEventListener("hashchange", update));
  return route;
}
