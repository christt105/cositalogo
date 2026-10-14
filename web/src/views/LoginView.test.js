import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginView from "./LoginView.vue";
import { button, fakeApi, json, mountView, settle } from "../test/helpers.js";

const USER = { id: 7, name: "Ana", member: false, admin: false };
const START = { url: "https://t.me/CositalogoBot?start=login_abc", expiresAt: Date.UTC(2026, 9, 14, 12, 5) };

let view;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 14, 12, 0));
  history.replaceState(null, "", "/#/login?next=%2Fadd");
});
afterEach(() => {
  view?.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush() {
  await vi.advanceTimersByTimeAsync(0);
  await settle(1);
}

async function mount(routes) {
  const api = fakeApi({ "GET /api/catalog": [], "GET /api/me": json({}, 401), "POST /api/login": json(START, 201), ...routes });
  const mounting = mountView(LoginView, { query: new URLSearchParams("next=/add") });
  await flush();
  view = await mounting;
  return api;
}

describe("LoginView", () => {
  it("opens the bot link, polls until Telegram confirms and goes back", async () => {
    let polls = 0;
    const api = await mount({ "POST /api/login/poll": () => (++polls < 3 ? json({ pending: true }, 202) : json(USER)) });
    button(view.root, "Iniciar sesión con Telegram").click();
    await flush();
    expect(button(view.root, "Abrir Telegram").getAttribute("href")).toBe(START.url);
    expect(view.root.textContent).toContain("caduca en 5:00");
    await vi.advanceTimersByTimeAsync(2500);
    await settle(1);
    expect(view.root.textContent).toContain("caduca en 4:58");
    await vi.advanceTimersByTimeAsync(5000);
    await settle(1);
    expect(polls).toBe(3);
    expect(view.session.user.value).toEqual(USER);
    expect(location.hash).toBe("#/add");
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.calls.filter((c) => c.path === "/api/login/poll")).toHaveLength(3);
  });

  it("offers a new link when the old one expires", async () => {
    await mount({ "POST /api/login/poll": json({ error: "this sign-in expired, start again" }, 410) });
    button(view.root, "Iniciar sesión con Telegram").click();
    await flush();
    await vi.advanceTimersByTimeAsync(2500);
    await settle(1);
    expect(view.root.textContent).toContain("ha caducado");
    button(view.root, "Pedir otro enlace").click();
    await flush();
    expect(button(view.root, "Abrir Telegram")).not.toBeNull();
  });

  it("offers to retry when the sign-in cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount({ "POST /api/login": json({ error: "boom" }, 500) });
    button(view.root, "Iniciar sesión con Telegram").click();
    await flush();
    expect(button(view.root, "Reintentar")).not.toBeNull();
  });

  it("stops polling when the page is left", async () => {
    const api = await mount({ "POST /api/login/poll": json({ pending: true }, 202) });
    button(view.root, "Iniciar sesión con Telegram").click();
    await flush();
    view.unmount();
    view = null;
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.calls.filter((c) => c.path === "/api/login/poll")).toHaveLength(0);
  });

  it("says so when the user is already signed in", async () => {
    await mount({ "GET /api/me": USER });
    expect(view.root.textContent).toContain("Ya has iniciado sesión como Ana");
  });
});
