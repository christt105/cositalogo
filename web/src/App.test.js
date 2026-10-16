import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { createWebHistory } from "vue-router";
import App from "./App.vue";
import { createAppRouter } from "./router.js";

const CATALOG = [
  { type: "movie", tmdb: 550, imdb: "tt0137523", title: "El club de la lucha", originalTitle: "Fight Club", year: "1999", poster: "https://image.tmdb.org/p.jpg", qualities: ["1080p"], genres: ["Drama"], links: [{ quality: "1080p", audio: ["Español"], subs: [] }] },
  { type: "series", tmdb: 1399, imdb: null, title: "Juego de tronos", originalTitle: "Game of Thrones", year: "2011", poster: null, qualities: ["4K", "1080p"], genres: ["Acción"], links: [{ season: 1, quality: "4K", audio: ["Inglés"], subs: ["Español"] }, { season: 2, quality: "1080p", audio: ["Español"], subs: [] }] },
];

const settle = () => new Promise((resolve) => setTimeout(resolve));

let root;
let app;
let router;

async function mount(path, response = new Response(JSON.stringify(CATALOG))) {
  history.replaceState(null, "", path);
  vi.stubGlobal("fetch", vi.fn(async (path) => (path === "/api/catalog" ? response : new Response('{"error":"sign in first"}', { status: 401 }))));
  root = document.createElement("div");
  document.body.append(root);
  router = createAppRouter(createWebHistory());
  app = createApp(App).use(router);
  await router.isReady();
  app.mount(root);
  await settle();
  await nextTick();
}

const titles = () => [...root.querySelectorAll(".card__title")].map((el) => el.textContent);

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

afterEach(() => {
  app.unmount();
  root.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("App", () => {
  it("shows every title with its type, seasons and qualities", async () => {
    await mount("/");
    expect(fetch).toHaveBeenCalledWith("/api/catalog", { method: "GET", cache: "no-cache" });
    expect(titles()).toEqual(["El club de la lucha", "Juego de tronos"]);
    const cards = root.querySelectorAll(".card");
    expect(cards[1].querySelector(".card__type").textContent).toBe("Serie · T1-2");
    expect([...cards[1].querySelectorAll(".badge")].map((el) => el.textContent)).toEqual(["4K", "1080p"]);
    expect(cards[1].querySelector("img")).toBeNull();
    expect(root.querySelector(".toolbar__count").textContent).toBe("2 títulos");
  });

  it("starts from the search in the query", async () => {
    await mount("/?q=thrones");
    expect(root.querySelector(".search").value).toBe("thrones");
    expect(titles()).toEqual(["Juego de tronos"]);
  });

  it("starts from the filters in the query and shows the matching titles", async () => {
    await mount("/?type=series&quality=4K");
    expect(root.querySelector('[data-filter="type"]').value).toBe("series");
    expect(titles()).toEqual(["Juego de tronos"]);
    await router.push("/?audio=Espa%C3%B1ol&subs=Espa%C3%B1ol");
    await settle();
    expect(titles()).toEqual([]);
  });

  it("applies a filter from its select, keeps the search and can clear them", async () => {
    await mount("/?q=o");
    const select = root.querySelector('[data-filter="quality"]');
    expect([...select.options].map((o) => o.value)).toEqual(["", "1080p", "4K"]);
    select.value = "4K";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(router.currentRoute.value.fullPath).toBe("/?q=o&quality=4K");
    expect(titles()).toEqual(["Juego de tronos"]);
    root.querySelector(".filters__clear").click();
    await settle();
    expect(router.currentRoute.value.fullPath).toBe("/?q=o");
    expect(root.querySelector(".filters__clear")).toBeNull();
  });

  it("filters as the user types and keeps the search in the query", async () => {
    await mount("/");
    vi.useFakeTimers();
    const input = root.querySelector(".search");
    input.value = "fight";
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(titles()).toEqual(["El club de la lucha"]);
    vi.useRealTimers();
    await settle();
    expect(location.pathname + location.search).toBe("/?q=fight");
    expect(router.currentRoute.value.fullPath).toBe("/?q=fight");
  });

  it("keeps what the user is typing when the search lands in the query", async () => {
    await mount("/");
    vi.useFakeTimers();
    const input = root.querySelector(".search");
    input.value = "fight ";
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    await settle();
    expect(router.currentRoute.value.fullPath).toBe("/?q=fight");
    expect(input.value).toBe("fight ");
  });

  it("opens a title page from its card without reloading", async () => {
    await mount("/");
    root.querySelector("a.card").click();
    await settle();
    expect(location.pathname).toBe("/movie/550");
    expect(fetch).toHaveBeenCalledWith("/api/titles/movie/550", expect.anything());
    expect(fetch.mock.calls.filter(([path]) => path === "/api/catalog")).toHaveLength(1);
  });

  it("follows a navigation", async () => {
    await mount("/?q=fight");
    await router.push("/?q=tronos");
    await nextTick();
    expect(root.querySelector(".search").value).toBe("tronos");
    expect(titles()).toEqual(["Juego de tronos"]);
  });

  it("opens a title page from its address", async () => {
    await mount("/movie/550");
    expect(root.querySelector(".grid")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/titles/movie/550", expect.anything());
  });

  it("only takes TMDB ids as title pages", async () => {
    await mount("/movie/abc");
    expect(root.textContent).toContain("Aquí no hay nada.");
  });

  it("says when nothing matches", async () => {
    await mount("/?q=zzz");
    expect(root.querySelector(".grid")).toBeNull();
    expect(root.textContent).toContain("No hay nada que coincida con «zzz».");
  });

  it("shows an error when the catalog cannot be loaded", async () => {
    await mount("/", new Response("", { status: 503 }));
    expect(root.textContent).toContain("No se ha podido cargar el catálogo");
    expect(root.querySelector(".toolbar__count")).toBeNull();
  });

  it("links every card to its title page", async () => {
    await mount("/");
    expect([...root.querySelectorAll("a.card")].map((a) => a.getAttribute("href"))).toEqual(["/movie/550", "/series/1399"]);
  });

  it("offers to sign in when there is no session", async () => {
    await mount("/?q=fight");
    expect(root.querySelector(".header__session a").getAttribute("href")).toBe("/login");
  });

  it("shows a way back for any other route", async () => {
    await mount("/nope/550");
    expect(root.querySelector(".grid")).toBeNull();
    expect(root.querySelector('a.btn[href="/"]')).not.toBeNull();
  });
});
