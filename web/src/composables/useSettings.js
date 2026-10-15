import { inject, provide, ref, shallowRef } from "vue";
import { getSettings } from "../api/settings.js";

const SETTINGS = Symbol("settings");

/**
 * Qualities, groups and languages for the link forms, loaded the first time
 * a form calls `load()` and kept for the rest of the visit. `status` is
 * `idle`, `loading`, `ready` or `error`; a failed load can be retried.
 */
export function createSettings(fetchSettings = getSettings) {
  const data = shallowRef(null);
  const status = ref("idle");
  let pending = null;

  function load() {
    if (status.value === "ready") return Promise.resolve(data.value);
    pending ??= fetchSettings()
      .then((settings) => {
        data.value = settings;
        status.value = "ready";
        return settings;
      })
      .catch((err) => {
        console.error("Could not load the settings", err);
        status.value = "error";
        return null;
      })
      .finally(() => {
        pending = null;
      });
    status.value = "loading";
    return pending;
  }

  return { data, status, load };
}

export function provideSettings(settings = createSettings()) {
  provide(SETTINGS, settings);
  return settings;
}

/** The settings provided by an ancestor with `provideSettings`. */
export function useSettings() {
  const settings = inject(SETTINGS, null);
  if (!settings) throw new Error("useSettings() needs provideSettings() in an ancestor");
  return settings;
}
