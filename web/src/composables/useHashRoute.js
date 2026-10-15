import { onBeforeUnmount, shallowRef } from "vue";
import { parseHash } from "../lib/route.js";

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
