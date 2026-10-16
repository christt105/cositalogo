import { vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import { createMemoryHistory } from "vue-router";
import { createCatalog, provideCatalog } from "../composables/useCatalog.js";
import { createSession, provideSession } from "../composables/useSession.js";
import { createSettings, provideSettings } from "../composables/useSettings.js";
import { createAppRouter } from "../router.js";

export const SETTINGS = {
  qualities: ["1080p", "4K"],
  groups: { 2229558644: "General", 2142474284: "Comunidad" },
  languages: { audio: ["Castellano", "Inglés", "Japonés"], subs: ["Castellano", "Inglés", "Forzados"] },
};

export const json = (body, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status });

/**
 * A fake `fetch` for the API: `routes` maps `"METHOD /path"` to a Response,
 * a value to answer as JSON, or a function of the request init returning
 * either. Unknown routes answer 404. Every call is recorded in `calls`.
 */
export function fakeApi(routes) {
  const calls = [];
  const fetchImpl = vi.fn(async (path, init = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body, init });
    let answer = routes[`${method} ${path}`];
    if (typeof answer === "function") answer = await answer(body, init);
    if (answer === undefined) return json({ error: "not found" }, 404);
    return answer instanceof Response ? answer.clone() : json(answer);
  });
  vi.stubGlobal("fetch", fetchImpl);
  return { fetch: fetchImpl, calls, routes };
}

const realSetTimeout = globalThis.setTimeout;

/** Lets pending promises and the re-render that follows them run, even under fake timers. */
export async function settle(rounds = 3) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => realSetTimeout(resolve));
    await nextTick();
  }
}

/**
 * Mounts `component` with `props` under the same providers App.vue sets up,
 * all talking to the stubbed `fetch`, and a router in memory that starts at
 * `path`. Returns the root element, the shared state, the router and
 * `unmount()`.
 */
export async function mountView(component, props = {}, path = "/") {
  const root = document.createElement("div");
  document.body.append(root);
  const state = {};
  const Host = defineComponent({
    setup() {
      state.catalog = provideCatalog(createCatalog());
      state.session = provideSession(createSession());
      state.settings = provideSettings(createSettings());
      return () => h(component, props);
    },
  });
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  const app = createApp(Host).use(router);
  app.mount(root);
  await settle();
  return {
    root,
    ...state,
    router,
    unmount() {
      app.unmount();
      root.remove();
    },
  };
}

/** Sets an input's value and fires the events Vue listens to. */
export function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input"));
  el.dispatchEvent(new Event("change"));
}

/** The button whose text is `text`. */
export function button(root, text) {
  return [...root.querySelectorAll("button, a.btn")].find((b) => b.textContent.trim() === text) ?? null;
}
