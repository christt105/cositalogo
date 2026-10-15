import { afterEach, describe, expect, it, vi } from "vitest";
import AppHeader from "./AppHeader.vue";
import { button, fakeApi, json, mountView, settle } from "../test/helpers.js";

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const signedIn = (user) => fakeApi({ "GET /api/catalog": [], "GET /api/me": user, "POST /api/logout": json(undefined, 204) });

describe("AppHeader", () => {
  it("offers to sign in and come back to the current page", async () => {
    fakeApi({ "GET /api/catalog": [], "GET /api/me": json({ error: "sign in first" }, 401) });
    view = await mountView(AppHeader, { path: "/movie/550" });
    expect(button(view.root, "Iniciar sesión").getAttribute("href")).toBe("#/login?next=%2Fmovie%2F550");
  });

  it("asks a signed-in user without the password to unlock", async () => {
    signedIn({ id: 1, name: "Ana", member: false, admin: false });
    view = await mountView(AppHeader, { path: "/" });
    expect(view.root.querySelector(".header__user").textContent).toBe("Ana");
    expect(button(view.root, "Desbloquear").getAttribute("href")).toBe("#/unlock");
    expect(button(view.root, "Añadir")).toBeNull();
  });

  it("lets a member add and sign out", async () => {
    const api = signedIn({ id: 1, name: "Ana", member: true, admin: false });
    view = await mountView(AppHeader, { path: "/" });
    expect(button(view.root, "Añadir").getAttribute("href")).toBe("#/add");
    button(view.root, "Salir").click();
    await settle();
    expect(api.calls.at(-1)).toMatchObject({ method: "POST", path: "/api/logout" });
    expect(button(view.root, "Iniciar sesión")).not.toBeNull();
  });
});
