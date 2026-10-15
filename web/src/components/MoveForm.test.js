import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import MoveForm from "./MoveForm.vue";
import { button, fakeApi, mountView, settle, type } from "../test/helpers.js";

const GOT = { type: "series", tmdb: 1399, title: "Juego de tronos", year: "2011", poster: null, seasons: [{ season_number: 1, name: "Temporada 1" }, { season_number: 2, name: "Temporada 2" }] };
const MATRIX = { type: "movie", tmdb: 603, title: "Matrix", year: "1999", poster: null, seasons: [] };

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(link, from) {
  fakeApi({ "GET /api/catalog": [] });
  const events = [];
  const loadTitle = vi.fn(async (type) => (type === "series" ? GOT : MATRIX));
  const search = vi.fn(async (q) => [q === "got" ? { type: "series", tmdb: 1399 } : { type: "movie", tmdb: 603 }]);
  const Host = defineComponent({
    render: () => h(MoveForm, { link, from, loadTitle, search, onMove: (t) => events.push(["move", t]), onCancel: () => events.push(["cancel"]) }),
  });
  view = await mountView(Host);
  return { events, loadTitle };
}

async function pick(query) {
  type(view.root.querySelector("#tmdb-search"), query);
  await new Promise((r) => setTimeout(r, 350));
  await settle();
}

const submit = async () => {
  view.root.querySelector("form").dispatchEvent(new Event("submit"));
  await settle(1);
};

describe("MoveForm", () => {
  it("moves a movie link to a series, starting on the first season", async () => {
    const { events, loadTitle } = await mount({ id: 1, quality: "1080p", audio: [], subs: [], tags: [], link: "x" }, { type: "movie", tmdb: 603 });
    expect(button(view.root, "Mover aquí").disabled).toBe(true);
    await pick("got");
    expect(loadTitle).toHaveBeenCalledWith("series", 1399);
    expect(view.root.querySelector(".selected__title").textContent).toBe("Juego de tronos");
    expect(view.root.querySelector("#move-season").value).toBe("1");
    await submit();
    expect(events).toEqual([["move", { type: "series", tmdb: 1399, season: 1 }]]);
  });

  it("keeps the season of the link and refuses moving it where it already is", async () => {
    const { events } = await mount({ id: 2, season: 2, quality: "4K", audio: [], subs: [], tags: [], link: "x" }, { type: "series", tmdb: 1399 });
    await pick("got");
    expect(view.root.querySelector("#move-season").value).toBe("2");
    expect(view.root.textContent).toContain("El enlace ya está aquí.");
    expect(button(view.root, "Mover aquí").disabled).toBe(true);
    const season = view.root.querySelector("#move-season");
    season.value = "all";
    season.dispatchEvent(new Event("change"));
    await settle(1);
    await submit();
    expect(events).toEqual([["move", { type: "series", tmdb: 1399, season: "all" }]]);
  });

  it("sends no season for a movie and can be cancelled", async () => {
    const { events } = await mount({ id: 3, season: 1, quality: "4K", audio: [], subs: [], tags: [], link: "x" }, { type: "series", tmdb: 1399 });
    await pick("matrix");
    expect(view.root.querySelector("#move-season")).toBeNull();
    await submit();
    button(view.root, "Cancelar").click();
    expect(events).toEqual([["move", { type: "movie", tmdb: 603 }], ["cancel"]]);
  });
});
