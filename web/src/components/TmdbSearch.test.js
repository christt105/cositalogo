import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import TmdbSearch from "./TmdbSearch.vue";
import { fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const RESULTS = [
  { type: "movie", tmdb: 550, title: "El club de la lucha", year: "1999", poster: null },
  { type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: "https://image.tmdb.org/t/p/w92/got.jpg" },
];

let view;
let selected;
afterEach(() => {
  view?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(search, initial = "") {
  selected = [];
  fakeApi({ "GET /api/catalog": [{ type: "series", tmdb: 1399, title: "Juego de tronos", links: [] }], "GET /api/me": json({}, 401) });
  const Host = defineComponent({ setup: () => () => h(TmdbSearch, { search, initial, onSelect: (r) => selected.push(r) }) });
  view = await mountView(Host);
}

describe("TmdbSearch", () => {
  it("searches after the user stops typing and marks what is already in the catalog", async () => {
    const search = vi.fn(async () => RESULTS);
    await mount(search);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    type(view.root.querySelector("input"), "lucha");
    type(view.root.querySelector("input"), "club");
    await vi.advanceTimersByTimeAsync(300);
    await settle(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("club");
    const items = [...view.root.querySelectorAll(".result")];
    expect(items.map((b) => b.querySelector(".result__title").textContent)).toEqual(["El club de la lucha", "Juego de tronos"]);
    expect(items[1].textContent).toContain("Ya en el Cositálogo");
    expect(items[0].textContent).not.toContain("Ya en el Cositálogo");
    items[1].click();
    await settle(1);
    expect(selected).toEqual([RESULTS[1]]);
    expect(view.root.querySelector(".result")).toBeNull();
  });

  it("selects a pasted TMDB URL at once", async () => {
    await mount(async () => [{ type: "movie", tmdb: 550 }], "https://www.themoviedb.org/movie/550");
    expect(selected).toEqual([{ type: "movie", tmdb: 550 }]);
  });

  it("keeps only the answer to the latest search", async () => {
    let release;
    const slow = new Promise((resolve) => {
      release = resolve;
    });
    const search = vi.fn().mockReturnValueOnce(slow).mockResolvedValueOnce([RESULTS[0]]);
    await mount(search, "juego");
    type(view.root.querySelector("input"), "club");
    await new Promise((resolve) => setTimeout(resolve, 320));
    release([RESULTS[1]]);
    await settle();
    expect([...view.root.querySelectorAll(".result__title")].map((el) => el.textContent)).toEqual(["El club de la lucha"]);
  });

  it("says when TMDB fails or finds nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount(async () => {
      throw new Error("proxy down");
    }, "x");
    expect(view.root.textContent).toContain("No se ha podido buscar en TMDB");
    view.unmount();
    await mount(async () => [], "zzz");
    expect(view.root.textContent).toContain("Sin resultados en TMDB");
  });
});
