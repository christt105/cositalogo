import { afterEach, describe, expect, it, vi } from "vitest";
import AdminView from "./AdminView.vue";
import { button, fakeApi, json, mountView, settle } from "../test/helpers.js";

const ADMIN = { id: 9, name: "Jefa", member: true, admin: true };
const LINK = { type: "movie", tmdb: 603, quality: "1080p", audio: ["Castellano"], subs: [], tags: [], link: "https://t.me/c/1/2" };
const ENTRIES = [
  { id: 3, at: 0, user: { id: 7, name: "Ana" }, action: "update", target: "link:5", before: LINK, after: { ...LINK, quality: "4K" }, reverts: null, undoneBy: null },
  { id: 2, at: 0, user: { id: 7, name: "Ana" }, action: "grant", target: "member:7", before: null, after: { name: "Ana" }, reverts: null, undoneBy: null },
  { id: 1, at: 0, user: { id: 7, name: "Ana" }, action: "add", target: "link:5", before: null, after: LINK, reverts: null, undoneBy: 4 },
];

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(query = "", routes = {}, user = ADMIN) {
  let catalogLoads = 0;
  const api = fakeApi({
    "GET /api/catalog": () => (++catalogLoads, [{ type: "movie", tmdb: 603, title: "Matrix", links: [] }]),
    "GET /api/me": user,
    "GET /api/audit": { entries: ENTRIES, more: true },
    "GET /api/audit?before=1": { entries: [{ ...ENTRIES[1], id: 0 }], more: false },
    "GET /api/members": [{ id: 7, name: "Ana", since: 1 }, { id: 9, name: "Jefa", since: 0 }, { id: 8, name: "Bea", since: 2 }],
    "GET /api/admins": [{ id: 9, name: "Jefa", since: 0 }, { id: 8, name: "Bea", since: 3 }],
    ...routes,
  });
  view = await mountView(AdminView, { query: new URLSearchParams(query) }, `/admin${query ? `?${query}` : ""}`);
  await settle();
  return { api, catalogLoads: () => catalogLoads };
}

const entries = () => [...view.root.querySelectorAll(".audit__entry")];

describe("AdminView", () => {
  it("is only for admins", async () => {
    const { api } = await mount("", {}, { id: 7, name: "Ana", member: true, admin: false });
    expect(view.root.textContent).toContain("solo para admins");
    expect(api.calls.some((c) => c.path.startsWith("/api/audit"))).toBe(false);
  });

  it("asks a visitor to sign in", async () => {
    await mount("", {}, json({}, 401));
    expect(button(view.root, "Iniciar sesión").getAttribute("href")).toBe("/login?next=%2Fadmin");
  });

  it("lists the activity with names, details and undo only where it still applies", async () => {
    await mount();
    expect(entries().map((e) => e.querySelector(".audit__line").textContent.replace(/\s+/g, " ").trim())).toEqual([
      "Ana Editó Matrix", "Ana Dio acceso a", "Ana Añadió Matrix",
    ]);
    expect(entries()[0].querySelector(".audit__detail").textContent).toBe("calidad: 1080p → 4K");
    expect(button(entries()[0], "Deshacer")).not.toBeNull();
    expect(button(entries()[1], "Deshacer")).toBeNull();
    expect(button(entries()[2], "Deshacer")).toBeNull();
    expect(entries()[2].textContent).toContain("deshecho en #4");
  });

  it("undoes after a confirmation and reloads the log and the catalog", async () => {
    const { api, catalogLoads } = await mount("", { "POST /api/audit/3/undo": { id: 4 } });
    button(entries()[0], "Deshacer").click();
    await settle(1);
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
    button(entries()[0], "Sí, deshacer").click();
    await settle();
    const post = api.calls.find((c) => c.method === "POST");
    expect(post.path).toBe("/api/audit/3/undo");
    expect(post.body).toEqual({});
    expect(api.calls.filter((c) => c.path === "/api/audit")).toHaveLength(2);
    expect(catalogLoads()).toBe(2);
  });

  it("shows why an undo was refused", async () => {
    await mount("", { "POST /api/audit/3/undo": json({ error: "the link changed after this write" }, 409) });
    button(entries()[0], "Deshacer").click();
    await settle(1);
    button(entries()[0], "Sí, deshacer").click();
    await settle();
    expect(view.root.querySelector("[role=alert]").textContent).toContain("changed after");
  });

  it("loads older pages", async () => {
    await mount();
    button(view.root, "Ver más").click();
    await settle();
    expect(entries()).toHaveLength(4);
    expect(button(view.root, "Ver más")).toBeNull();
  });

  it("keeps one title's history when the query says so", async () => {
    const { api } = await mount("title=movie:603", { "GET /api/audit?title=movie%3A603": { entries: [ENTRIES[0]], more: false } });
    expect(api.calls.some((c) => c.path === "/api/audit?title=movie%3A603")).toBe(true);
    expect(view.root.textContent).toContain("Solo los cambios de Matrix");
    expect(entries()).toHaveLength(1);
  });

  it("lists members with admins first and changes roles", async () => {
    const { api } = await mount("tab=members", {
      "PUT /api/admins/7": json(undefined, 204),
      "DELETE /api/admins/8": json(undefined, 204),
    });
    const names = () => entries().map((e) => e.querySelector("strong").textContent);
    expect(names()).toEqual(["Jefa", "Bea", "Ana"]);
    expect(entries()[0].querySelector("button")).toBeNull();
    button(entries()[2], "Hacer admin").click();
    await settle();
    expect(api.calls.find((c) => c.method === "PUT").path).toBe("/api/admins/7");
    button(entries()[1], "Quitar admin").click();
    await settle(1);
    button(entries()[1], "Sí, quitar admin").click();
    await settle();
    expect(api.calls.find((c) => c.method === "DELETE").path).toBe("/api/admins/8");
  });

  it("revokes a member after a confirmation", async () => {
    const { api } = await mount("tab=members", { "DELETE /api/members/7": json(undefined, 204) });
    button(entries()[2], "Quitar acceso").click();
    await settle(1);
    button(entries()[2], "Sí, quitar acceso").click();
    await settle();
    expect(api.calls.find((c) => c.method === "DELETE").path).toBe("/api/members/7");
  });

  describe("Por comprobar", () => {
    const REVIEW = [
      { id: 21, type: "movie", tmdb: 603, quality: "1080p", link: "https://t.me/c/1/2/21", doubtful: true, postedAt: 0 },
      { id: 22, type: "movie", tmdb: 129, quality: "4K", link: "https://t.me/c/1/2/22", doubtful: false, postedAt: 0 },
    ];

    it("lists what the scan matched, doubtful first, and checks several at once", async () => {
      let left = REVIEW;
      const { api } = await mount("tab=review", {
        "GET /api/review": () => left,
        "POST /api/links/verify": (body) => ((left = left.filter((i) => !body.ids.includes(i.id))), { verified: body.ids.length }),
      });
      expect(entries().map((e) => e.querySelector("a").textContent)).toEqual(["Matrix", "movie:129"]);
      expect(entries()[0].textContent).toContain("dudoso");
      view.root.querySelector(".review__bar input[type=checkbox]").click();
      await settle();
      button(view.root, "Están bien (2)").click();
      await settle();
      expect(api.calls.find((c) => c.path === "/api/links/verify").body).toEqual({ ids: [21, 22] });
      expect(view.root.textContent).toContain("No queda nada por comprobar");
    });

    it("can show only the doubtful ones", async () => {
      await mount("tab=review", { "GET /api/review": REVIEW });
      const [, onlyDoubtful] = view.root.querySelectorAll(".review__bar input[type=checkbox]");
      onlyDoubtful.click();
      await settle();
      expect(entries()).toHaveLength(1);
    });
  });
});
