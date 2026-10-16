import { afterEach, describe, expect, it, vi } from "vitest";
import AddView from "./AddView.vue";
import { SETTINGS, button, fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const MEMBER = { id: 7, name: "Ana", member: true, admin: false };
const GOT = { type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: null, seasons: [{ season_number: 1, name: "Temporada 1" }, { season_number: 2, name: "Temporada 2" }] };
const EXISTING = { type: "series", tmdb: 1399, title: "Juego de tronos", links: [{ season: 1, seasonName: "Temporada 1", quality: "1080p", audio: ["Castellano"], subs: [], tags: [] }] };
const LINK = "https://t.me/c/2229558644/777";
const POSTER = "https://image.tmdb.org/t/p/w342/es.jpg";

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(routes, query = "type=series&tmdb=1399") {
  let catalogLoads = 0;
  const api = fakeApi({
    "GET /api/catalog": () => (++catalogLoads, [EXISTING]),
    "GET /api/me": MEMBER,
    "GET /api/settings": SETTINGS,
    ...routes,
  });
  const loadTitle = vi.fn(async () => GOT);
  const loadPosters = vi.fn(async () => [{ key: "es", label: "Castellano", posters: [{ value: POSTER, thumb: POSTER }] }]);
  view = await mountView(AddView, { query: new URLSearchParams(query), loadTitle, loadPosters }, `/add?${query}`);
  await settle();
  return { api, loadTitle, catalogLoads: () => catalogLoads };
}

async function fillAndSend() {
  type(view.root.querySelector("input[type=url]"), LINK);
  await settle(1);
  view.root.querySelector("form").dispatchEvent(new Event("submit"));
  await settle();
}

describe("AddView", () => {
  it("is behind the write gate", async () => {
    await mount({ "GET /api/me": json({}, 401) });
    expect(view.root.querySelector("#tmdb-search")).toBeNull();
    expect(button(view.root, "Iniciar sesión").getAttribute("href")).toBe("/login?next=%2Fadd");
  });

  it("shows the versions the title already has", async () => {
    const { loadTitle } = await mount({});
    expect(loadTitle).toHaveBeenCalledWith("series", 1399);
    expect(view.root.querySelector(".selected__title").textContent).toBe("Juego de tronos");
    expect(view.root.querySelector(".existing").textContent).toContain("Temporada 1");
    expect(view.root.querySelector('.existing a').getAttribute("href")).toBe("/series/1399");
  });

  it("adds the link, reloads the catalog and opens the title page", async () => {
    const { api, catalogLoads } = await mount({ "POST /api/links": json({ id: 9 }, 201) });
    await fillAndSend();
    const post = api.calls.find((c) => c.method === "POST");
    expect(post).toMatchObject({ path: "/api/links", body: { type: "series", tmdb: 1399, season: 1, quality: "1080p", audio: [], subs: [], tags: [], link: LINK } });
    expect(post.init.headers).toEqual({ "content-type": "application/json" });
    expect(catalogLoads()).toBe(2);
    expect(view.router.currentRoute.value.fullPath).toBe("/series/1399");
  });

  it("offers no poster picker for a title already in the catalog", async () => {
    await mount({});
    expect(view.root.querySelector(".poster-picker")).toBeNull();
  });

  it("sends the chosen poster with the first link of a new title", async () => {
    const { api } = await mount({ "GET /api/catalog": [], "POST /api/links": json({ id: 9 }, 201) });
    view.root.querySelector(".poster-grid .poster").click();
    await settle(1);
    expect(view.root.querySelector(".selected__poster").getAttribute("src")).toBe(POSTER);
    await fillAndSend();
    expect(api.calls.find((c) => c.method === "POST").body).toMatchObject({ type: "series", tmdb: 1399, poster: POSTER });
  });

  it("sends no poster when the default is kept", async () => {
    const { api } = await mount({ "GET /api/catalog": [], "POST /api/links": json({ id: 9 }, 201) });
    await fillAndSend();
    expect(api.calls.find((c) => c.method === "POST").body).not.toHaveProperty("poster");
  });

  it("shows why the API refused it", async () => {
    await mount({ "POST /api/links": json({ error: "that Telegram message is already link 3 of movie:550" }, 409) });
    await fillAndSend();
    expect(view.root.querySelector("[role=alert]").textContent).toContain("already link 3");
    expect(view.router.currentRoute.value.fullPath).toBe("/add?type=series&tmdb=1399");
  });

  it("drops the session when the API says it is gone", async () => {
    await mount({ "POST /api/links": json({ error: "sign in first" }, 401) });
    await fillAndSend();
    expect(view.session.user.value).toBeNull();
    expect(button(view.root, "Iniciar sesión")).not.toBeNull();
  });

  it("starts empty without a title in the query", async () => {
    const { loadTitle } = await mount({}, "");
    expect(loadTitle).not.toHaveBeenCalled();
    expect(view.root.querySelector("#tmdb-search")).not.toBeNull();
    expect(view.root.querySelector("form")).toBeNull();
  });
});
