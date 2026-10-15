import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import App from "./App.vue";

const CATALOG = [
  { type: "movie", tmdb: 550, imdb: "tt0137523", title: "El club de la lucha", originalTitle: "Fight Club", year: "1999", poster: "https://image.tmdb.org/p.jpg", qualities: ["1080p"], links: [] },
  { type: "series", tmdb: 1399, imdb: null, title: "Juego de tronos", originalTitle: "Game of Thrones", year: "2011", poster: null, qualities: ["4K", "1080p"], links: [{ season: 1 }, { season: 2 }] },
];

const settle = () => new Promise((resolve) => setTimeout(resolve));

let root;
let app;

async function mount(hash, response = new Response(JSON.stringify(CATALOG))) {
  history.replaceState(null, "", `/${hash}`);
  vi.stubGlobal("fetch", vi.fn(async (path) => (path === "/api/catalog" ? response : new Response('{"error":"sign in first"}', { status: 401 }))));
  root = document.createElement("div");
  document.body.append(root);
  app = createApp(App);
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
    await mount("#/");
    expect(fetch).toHaveBeenCalledWith("/api/catalog", { method: "GET", cache: "no-cache" });
    expect(titles()).toEqual(["El club de la lucha", "Juego de tronos"]);
    const cards = root.querySelectorAll(".card");
    expect(cards[1].querySelector(".card__type").textContent).toBe("Serie · T1-2");
    expect([...cards[1].querySelectorAll(".badge")].map((el) => el.textContent)).toEqual(["4K", "1080p"]);
    expect(cards[1].querySelector("img")).toBeNull();
    expect(root.querySelector(".toolbar__count").textContent).toBe("2 títulos");
  });

  it("starts from the search in the hash", async () => {
    await mount("#/?q=thrones");
    expect(root.querySelector(".search").value).toBe("thrones");
    expect(titles()).toEqual(["Juego de tronos"]);
  });

  it("filters as the user types and keeps the search in the hash", async () => {
    await mount("#/");
    vi.useFakeTimers();
    const input = root.querySelector(".search");
    input.value = "fight";
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(titles()).toEqual(["El club de la lucha"]);
    expect(location.hash).toBe("#/?q=fight");
  });

  it("follows a hash change from the browser", async () => {
    await mount("#/?q=fight");
    history.replaceState(null, "", "/#/?q=tronos");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await nextTick();
    expect(root.querySelector(".search").value).toBe("tronos");
    expect(titles()).toEqual(["Juego de tronos"]);
  });

  it("says when nothing matches", async () => {
    await mount("#/?q=zzz");
    expect(root.querySelector(".grid")).toBeNull();
    expect(root.textContent).toContain("No hay nada que coincida con «zzz».");
  });

  it("shows an error when the catalog cannot be loaded", async () => {
    await mount("#/", new Response("", { status: 503 }));
    expect(root.textContent).toContain("No se ha podido cargar el catálogo");
    expect(root.querySelector(".toolbar__count")).toBeNull();
  });

  it("links every card to its title page", async () => {
    await mount("#/");
    expect([...root.querySelectorAll("a.card")].map((a) => a.getAttribute("href"))).toEqual(["#/movie/550", "#/series/1399"]);
  });

  it("offers to sign in when there is no session", async () => {
    await mount("#/?q=fight");
    expect(root.querySelector(".header__session a").getAttribute("href")).toBe("#/login");
  });

  it("shows a way back for any other route", async () => {
    await mount("#/nope/550");
    expect(root.querySelector(".grid")).toBeNull();
    expect(root.querySelector('a.btn[href="#/"]')).not.toBeNull();
  });
});
