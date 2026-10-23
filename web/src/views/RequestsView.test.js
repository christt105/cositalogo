import { afterEach, describe, expect, it, vi } from "vitest";
import RequestsView from "./RequestsView.vue";
import { button, fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const MEMBER = { id: 7, name: "Ana", member: true, admin: false };
const GOT = { type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: null, seasons: [{ season_number: 2, name: "Temporada 2" }, { season_number: 1, name: "Temporada 1" }] };
const request = (overrides) => ({
  id: 1, type: "movie", tmdb: 603, title: "Matrix", year: "1999", poster: null, note: "", requestedBy: { id: 2, name: "Luis" },
  createdAt: Date.UTC(2026, 9, 20), votes: 1, voted: false, canDelete: false, fulfilledAt: null, ...overrides,
});
const OPEN = request({});
const MINE = request({ id: 2, type: "series", tmdb: 1399, title: "Juego de tronos", season: 2, seasonName: "Temporada 2", note: "en VOSE", requestedBy: { id: 7, name: "Ana" }, votes: 3, voted: true, canDelete: true });
const DONE = request({ id: 3, tmdb: 129, title: "El viaje de Chihiro", fulfilledAt: Date.UTC(2026, 9, 22) });

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(routes = {}) {
  const api = fakeApi({
    "GET /api/catalog": [{ type: "series", tmdb: 1399, title: "Juego de tronos", links: [] }],
    "GET /api/me": MEMBER,
    "GET /api/requests": [OPEN, MINE, DONE],
    ...routes,
  });
  const loadTitle = vi.fn(async () => GOT);
  view = await mountView(RequestsView, { loadTitle }, "/requests");
  await settle();
  return { api, loadTitle };
}

async function pick(routes) {
  const mounted = await mount(routes);
  type(view.root.querySelector("#tmdb-search"), "https://www.themoviedb.org/tv/1399");
  await new Promise((resolve) => setTimeout(resolve, 350));
  await settle();
  return mounted;
}

describe("RequestsView", () => {
  it("is behind the write gate and does not load requests for a non-member", async () => {
    const { api } = await mount({ "GET /api/me": { ...MEMBER, member: false } });
    expect(button(view.root, "Desbloquear").getAttribute("href")).toBe("/unlock?next=%2Frequests");
    expect(api.calls.some((c) => c.path === "/api/requests")).toBe(false);
  });

  it("names what signing in is for", async () => {
    await mount({ "GET /api/me": json({}, 401) });
    expect(view.root.textContent).toContain("Para pedir películas o temporadas tienes que iniciar sesión");
  });

  it("splits open and answered requests and shows who wants each", async () => {
    await mount();
    const headings = [...view.root.querySelectorAll(".requests__heading")].map((h) => h.textContent);
    expect(headings).toEqual(["Pendientes", "Cumplidas"]);
    const [open, mine, done] = [...view.root.querySelectorAll(".request")];
    expect(open.textContent).toContain("Pedida por Luis");
    expect(open.textContent).toContain("1 la quiere");
    expect(mine.textContent).toContain("Temporada 2");
    expect(mine.textContent).toContain("en VOSE");
    expect(mine.textContent).toContain("3 la quieren");
    expect(done.querySelector(".request__done a").getAttribute("href")).toBe("/movie/129");
    expect(button(done, "Yo también")).toBeNull();
    expect(button(open, "Borrar")).toBeNull();
  });

  it("votes, takes a vote back and reloads", async () => {
    const { api } = await mount({ "PUT /api/requests/1/vote": json(undefined, 204), "DELETE /api/requests/2/vote": json(undefined, 204) });
    button(view.root.querySelector(".request"), "Yo también").click();
    await settle();
    expect(api.calls.some((c) => c.method === "PUT" && c.path === "/api/requests/1/vote")).toBe(true);
    button(view.root.querySelectorAll(".request")[1], "Ya no la quiero").click();
    await settle();
    expect(api.calls.some((c) => c.method === "DELETE" && c.path === "/api/requests/2/vote")).toBe(true);
    expect(api.calls.filter((c) => c.path === "/api/requests" && c.method === "GET")).toHaveLength(3);
  });

  it("asks before deleting a request", async () => {
    const { api } = await mount({ "DELETE /api/requests/2": json(undefined, 204) });
    const mine = view.root.querySelectorAll(".request")[1];
    button(mine, "Borrar").click();
    await settle(1);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    button(mine, "Borrar petición").click();
    await settle();
    expect(api.calls.some((c) => c.method === "DELETE" && c.path === "/api/requests/2")).toBe(true);
  });

  it("asks for one season with a note and says when it joined an earlier request", async () => {
    const { api, loadTitle } = await pick({ "POST /api/requests": json(MINE, 200) });
    expect(loadTitle).toHaveBeenCalledWith("series", 1399);
    expect(view.root.querySelector(".existing a").getAttribute("href")).toBe("/series/1399");
    const options = [...view.root.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options).toEqual(["La serie entera", "Temporada 1", "Temporada 2"]);
    const select = view.root.querySelector("select");
    select.value = "2";
    select.dispatchEvent(new Event("change"));
    type(view.root.querySelector(".request-form input[type=text]"), "  en VOSE ");
    await settle(1);
    view.root.querySelector(".request-form").dispatchEvent(new Event("submit"));
    await settle();
    expect(api.calls.find((c) => c.method === "POST").body).toEqual({ type: "series", tmdb: 1399, season: 2, note: "en VOSE" });
    expect(view.root.querySelector("[role=status]").textContent).toContain("te hemos sumado");
    expect(view.root.querySelector(".request-form")).toBeNull();
  });

  it("asks for a whole series without a season and keeps the form on an error", async () => {
    const { api } = await pick({ "POST /api/requests": json({ error: "TMDB has no series with id 1399" }, 422) });
    view.root.querySelector(".request-form").dispatchEvent(new Event("submit"));
    await settle();
    expect(api.calls.find((c) => c.method === "POST").body).toEqual({ type: "series", tmdb: 1399 });
    expect(view.root.querySelector("[role=alert]").textContent).toContain("La API no lo acepta");
    expect(view.root.querySelector(".request-form")).not.toBeNull();
  });
});
