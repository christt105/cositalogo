import { afterEach, describe, expect, it, vi } from "vitest";
import UnlockView from "./UnlockView.vue";
import { button, fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const USER = { id: 7, name: "Ana", member: false, admin: false };

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
});

async function mount(routes, query = "next=/movie/550") {
  history.replaceState(null, "", "/#/unlock");
  const api = fakeApi({ "GET /api/catalog": [], "GET /api/me": USER, ...routes });
  view = await mountView(UnlockView, { query: new URLSearchParams(query) });
  return api;
}

async function send(password) {
  type(view.root.querySelector("input[type=password]"), password);
  await settle(1);
  view.root.querySelector("form").dispatchEvent(new Event("submit"));
  await settle();
}

describe("UnlockView", () => {
  it("sends the password and goes back as a member", async () => {
    const api = await mount({ "POST /api/unlock": { ...USER, member: true } });
    await send("cosita");
    expect(api.calls.at(-1)).toMatchObject({ method: "POST", path: "/api/unlock", body: { password: "cosita" } });
    expect(api.calls.at(-1).init.headers).toEqual({ "content-type": "application/json" });
    expect(view.session.canWrite.value).toBe(true);
    expect(location.hash).toBe("#/movie/550");
  });

  it("explains a wrong password and too many tries", async () => {
    let answer = json({ error: "wrong password" }, 403);
    await mount({ "POST /api/unlock": () => answer });
    await send("nope");
    expect(view.root.querySelector("[role=alert]").textContent).toBe("Esa no es la contraseña.");
    answer = json({ error: "too many" }, 429);
    await send("nope");
    expect(view.root.querySelector("[role=alert]").textContent).toContain("Demasiados intentos");
  });

  it("asks to sign in first and to come back here", async () => {
    await mount({ "GET /api/me": json({}, 401) });
    expect(view.root.querySelector("form")).toBeNull();
    expect(button(view.root, "Iniciar sesión").getAttribute("href")).toBe("#/login?next=%2Funlock%3Fnext%3D%252Fmovie%252F550");
  });

  it("says a member has nothing to unlock", async () => {
    await mount({ "GET /api/me": { ...USER, member: true } });
    expect(view.root.textContent).toContain("Ya puedes añadir");
  });
});
