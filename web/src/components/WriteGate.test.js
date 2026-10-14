import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import WriteGate from "./WriteGate.vue";
import { button, fakeApi, json, mountView } from "../test/helpers.js";

const Gated = defineComponent({ setup: () => () => h(WriteGate, { path: "/add" }, { default: () => h("p", { class: "secret" }, "form") }) });

let view;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
});

describe("WriteGate", () => {
  it("sends a visitor to sign in", async () => {
    fakeApi({ "GET /api/catalog": [], "GET /api/me": json({}, 401) });
    view = await mountView(Gated);
    expect(view.root.querySelector(".secret")).toBeNull();
    expect(button(view.root, "Iniciar sesión").getAttribute("href")).toBe("#/login?next=%2Fadd");
  });

  it("sends a signed-in user without the password to unlock", async () => {
    fakeApi({ "GET /api/catalog": [], "GET /api/me": { id: 1, name: "Ana", member: false, admin: false } });
    view = await mountView(Gated);
    expect(button(view.root, "Desbloquear").getAttribute("href")).toBe("#/unlock?next=%2Fadd");
  });

  it("shows its content to a member", async () => {
    fakeApi({ "GET /api/catalog": [], "GET /api/me": { id: 1, name: "Ana", member: true, admin: false } });
    view = await mountView(Gated);
    expect(view.root.querySelector(".secret")).not.toBeNull();
  });
});
