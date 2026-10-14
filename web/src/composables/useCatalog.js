import { computed, inject, provide, ref, shallowRef } from "vue";
import { getCatalog } from "../api/catalog.js";
import { titleKey } from "../lib/catalog.js";

const CATALOG = Symbol("catalog");

/**
 * The shared catalog: its titles, an index by `type/tmdb`, the loading status
 * (`loading`, `ready` or `error`, which only shows when nothing ever loaded)
 * and `reload()` for after a write. When reloads overlap, only the answer to
 * the latest one is kept.
 */
export function createCatalog(load = getCatalog) {
  const items = shallowRef([]);
  const status = ref("loading");
  const byKey = computed(() => new Map(items.value.map((item) => [titleKey(item.type, item.tmdb), item])));
  let latest = 0;

  async function reload() {
    const call = ++latest;
    try {
      const next = await load();
      if (call !== latest) return;
      items.value = next;
      status.value = "ready";
    } catch (err) {
      if (call !== latest) return;
      console.error("Could not load the catalog", err);
      if (status.value !== "ready") status.value = "error";
    }
  }

  return { items, byKey, status, reload };
}

/** Creates the catalog for the calling component and everything below it, and starts loading it. */
export function provideCatalog(catalog = createCatalog()) {
  provide(CATALOG, catalog);
  catalog.reload();
  return catalog;
}

/** The catalog provided by an ancestor with `provideCatalog`. */
export function useCatalog() {
  const catalog = inject(CATALOG, null);
  if (!catalog) throw new Error("useCatalog() needs provideCatalog() in an ancestor");
  return catalog;
}
