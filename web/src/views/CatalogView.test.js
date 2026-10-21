import { afterEach, describe, expect, it, vi } from "vitest";
import CatalogView from "./CatalogView.vue";
import { fakeApi, mountView, settle } from "../test/helpers.js";

const link = { quality: "1080p", audio: ["Español"], subs: [] };
const CATALOG = [
  { type: "movie", tmdb: 1, title: "Zeta", year: "2001", genres: [], links: [link] },
  { type: "series", tmdb: 2, title: "Alfa", year: "1999", genres: [], links: [link] },
  { type: "movie", tmdb: 3, title: "Beta", year: null, genres: [], links: [link] },
];

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
});

async function mount(query = "") {
  fakeApi({ "GET /api/catalog": CATALOG, "GET /api/me": {} });
  view = await mountView(CatalogView, { query: new URLSearchParams(query) }, `/?${query}`);
}

const names = () => [...view.root.querySelectorAll(".card")].map((card) => card.textContent);
const sortSelect = () => view.root.querySelector("select[data-sort]");
const route = () => view.router.currentRoute.value;

async function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event("change"));
  await settle();
}

describe("CatalogView sorting", () => {
  it("shows the catalog order by default", async () => {
    await mount();
    expect(sortSelect().value).toBe("");
    expect(names().map((n) => n.includes("1999"))).toEqual([false, true, false]);
  });

  it("applies the sort from the URL and ignores unknown values", async () => {
    await mount("sort=year-asc");
    expect(sortSelect().value).toBe("year-asc");
    expect(names()[0]).toContain("1999");
    view.unmount();
    await mount("sort=bogus");
    expect(sortSelect().value).toBe("");
  });

  it("writes the sort to the URL and omits the default", async () => {
    await mount();
    await choose(sortSelect(), "year-desc");
    expect(route().query).toEqual({ sort: "year-desc" });
    await choose(sortSelect(), "");
    expect(route().query).toEqual({});
  });

  it("keeps the sort when a filter changes", async () => {
    await mount("sort=year-desc");
    await choose(view.root.querySelector('select[data-filter="type"]'), "movie");
    expect(route().query).toEqual({ sort: "year-desc", type: "movie" });
  });

  it("keeps the sort when the filters are cleared", async () => {
    await mount("sort=year-desc&type=movie");
    view.root.querySelector(".filters__clear").click();
    await settle();
    expect(route().query).toEqual({ sort: "year-desc" });
  });
});
