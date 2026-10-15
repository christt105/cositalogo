import { afterEach, describe, expect, it, vi } from "vitest";
import TitleView from "./TitleView.vue";
import { SETTINGS, button, fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const L1 = "https://t.me/c/2229558644/1";
const L2 = "https://t.me/c/2229558644/2";
const entry = (links) => ({
  type: "series", tmdb: 1399, title: "Juego de tronos", originalTitle: "Game of Thrones", year: "2011", poster: null,
  links: links.map(([season, quality, link]) => ({ season, seasonName: `Temporada ${season}`, quality, audio: ["Castellano"], subs: [], tags: [], group: "General", link })),
});
const owned = [
  { id: 11, type: "series", tmdb: 1399, season: 1, quality: "1080p", audio: ["Castellano"], subs: [], tags: [], link: L1, canDelete: true },
  { id: 12, type: "series", tmdb: 1399, season: 2, quality: "4K", audio: ["Castellano"], subs: [], tags: [], link: L2, canDelete: false },
];

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(user, routes = {}) {
  history.replaceState(null, "", "/#/series/1399");
  let catalogLoads = 0;
  let current = entry([[1, "1080p", L1], [2, "4K", L2]]);
  const api = fakeApi({
    "GET /api/catalog": () => (++catalogLoads, []),
    "GET /api/me": user ?? json({}, 401),
    "GET /api/settings": SETTINGS,
    "GET /api/titles/series/1399": () => (current ? { entry: current, detail: {} } : json({ error: "not found" }, 404)),
    "GET /api/titles/series/1399/links": owned,
    ...routes,
  });
  const loadTmdb = vi.fn(async (type, tmdb) => ({
    type, tmdb, title: type === "movie" ? "Matrix" : "Juego de tronos", year: "", poster: null,
    seasons: type === "movie" ? [] : [{ season_number: 1, name: "Temporada 1" }, { season_number: 2, name: "Temporada 2" }],
  }));
  view = await mountView(TitleView, { type: "series", id: "1399", loadTmdb });
  await settle();
  return { api, loadTmdb, setEntry: (next) => (current = next), catalogLoads: () => catalogLoads };
}

const rows = () => [...view.root.querySelectorAll(".link")];

describe("TitleView", () => {
  it("lists the links read-only for a visitor", async () => {
    const { api } = await mount(null);
    expect(view.root.querySelector(".selected__title").textContent).toBe("Juego de tronos");
    expect(rows().map((r) => r.querySelector(".link__season").textContent)).toEqual(["Temporada 1", "Temporada 2"]);
    expect(button(rows()[0], "Abrir").getAttribute("href")).toBe(L1);
    expect(button(rows()[0], "Editar")).toBeNull();
    expect(api.calls.some((c) => c.path.endsWith("/links"))).toBe(false);
  });

  it("lets a member edit any link but delete only their own", async () => {
    await mount({ id: 7, name: "Ana", member: true, admin: false });
    expect(button(rows()[0], "Editar")).not.toBeNull();
    expect(button(rows()[1], "Editar")).not.toBeNull();
    expect(button(rows()[0], "Borrar")).not.toBeNull();
    expect(button(rows()[1], "Borrar")).toBeNull();
    expect(button(view.root, "Añadir otra versión").getAttribute("href")).toBe("#/add?type=series&tmdb=1399");
  });

  it("shows no write buttons to a signed-in user without the password", async () => {
    await mount({ id: 7, name: "Ana", member: false, admin: false });
    expect(button(rows()[0], "Editar")).toBeNull();
    expect(button(view.root, "Añadir otra versión")).toBeNull();
  });

  it("edits a link with the TMDB seasons, then reloads the title and the catalog", async () => {
    const { api, loadTmdb, setEntry, catalogLoads } = await mount({ id: 7, name: "Ana", member: true, admin: false }, {
      "PATCH /api/links/12": (body) => ({ ...owned[1], ...body }),
    });
    button(rows()[1], "Editar").click();
    await settle();
    expect(loadTmdb).toHaveBeenCalledWith("series", 1399);
    const form = rows()[1].querySelector("form");
    expect(form.querySelector("select").value).toBe("2");
    const quality = form.querySelectorAll("select")[1];
    quality.value = "1080p";
    quality.dispatchEvent(new Event("change"));
    type(form.querySelector('input[placeholder="HDR, REMUX"]'), "REMUX");
    setEntry(entry([[1, "1080p", L1], [2, "1080p", L2]]));
    form.dispatchEvent(new Event("submit"));
    await settle();
    expect(api.calls.find((c) => c.method === "PATCH").body).toEqual({ season: 2, quality: "1080p", audio: ["Castellano"], subs: [], tags: ["REMUX"], link: L2 });
    expect(catalogLoads()).toBe(2);
    expect(rows()[1].querySelector("form")).toBeNull();
    expect(rows()[1].querySelector(".badge").textContent).toBe("1080p");
  });

  it("keeps the form open with the reason when an edit fails", async () => {
    await mount({ id: 7, name: "Ana", member: true, admin: false }, {
      "PATCH /api/links/11": json({ error: "that Telegram message is already link 4 of movie:550" }, 409),
    });
    button(rows()[0], "Editar").click();
    await settle();
    rows()[0].querySelector("form").dispatchEvent(new Event("submit"));
    await settle();
    expect(view.root.querySelector("[role=alert]").textContent).toContain("already link 4");
    expect(rows()[0].querySelector("form")).not.toBeNull();
  });

  it("deletes after a confirmation and says when the title is gone", async () => {
    const { api, setEntry } = await mount({ id: 7, name: "Ana", member: true, admin: false }, {
      "DELETE /api/links/11": json(undefined, 204),
    });
    button(rows()[0], "Borrar").click();
    await settle(1);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    setEntry(null);
    button(rows()[0], "Sí, borrar").click();
    await settle();
    expect(api.calls.find((c) => c.method === "DELETE").path).toBe("/api/links/11");
    expect(view.root.textContent).toContain("no está en el Cositálogo");
  });

  it("offers moving only the links the user may delete", async () => {
    await mount({ id: 7, name: "Ana", member: true, admin: false });
    expect(button(rows()[0], "Mover")).not.toBeNull();
    expect(button(rows()[1], "Mover")).toBeNull();
  });

  async function moveFirstTo(url) {
    button(rows()[0], "Mover").click();
    await settle(1);
    type(rows()[0].querySelector("#tmdb-search"), url);
    await new Promise((r) => setTimeout(r, 350));
    await settle();
    rows()[0].querySelector("form").dispatchEvent(new Event("submit"));
    await settle();
  }

  it("moves a link elsewhere, reloads and says where it went while the title keeps others", async () => {
    const { api, setEntry, catalogLoads } = await mount({ id: 7, name: "Ana", member: true, admin: false }, {
      "POST /api/links/11/move": (body) => ({ ...owned[0], ...body }),
    });
    setEntry(entry([[2, "4K", L2]]));
    await moveFirstTo("https://www.themoviedb.org/movie/603");
    expect(api.calls.find((c) => c.method === "POST").body).toEqual({ type: "movie", tmdb: 603 });
    expect(catalogLoads()).toBe(2);
    expect(rows()).toHaveLength(1);
    expect(view.root.querySelector("[role=status] a").getAttribute("href")).toBe("#/movie/603");
    expect(location.hash).toBe("#/series/1399");
  });

  it("follows the link when it was the last one of the title", async () => {
    const { setEntry } = await mount({ id: 7, name: "Ana", member: true, admin: true }, {
      "GET /api/titles/series/1399/links": [{ ...owned[0], canDelete: true }],
      "POST /api/links/11/move": (body) => ({ ...owned[0], ...body }),
    });
    setEntry(entry([[1, "1080p", L1]]));
    view.unmount();
    view = await mountView(TitleView, { type: "series", id: "1399", loadTmdb: async (type, tmdb) => ({ type, tmdb, title: "Matrix", year: "", poster: null, seasons: [] }) });
    await settle();
    setEntry(null);
    await moveFirstTo("https://www.themoviedb.org/movie/603");
    expect(location.hash).toBe("#/movie/603");
  });

  it("says when the title does not exist", async () => {
    fakeApi({ "GET /api/catalog": [], "GET /api/me": json({}, 401) });
    view = await mountView(TitleView, { type: "movie", id: "1" });
    expect(view.root.textContent).toContain("no está en el Cositálogo");
  });
});
