import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import LinkForm from "./LinkForm.vue";
import { SETTINGS, button, fakeApi, json, mountView, settle, type } from "../test/helpers.js";

const SEASONS = [{ season_number: 0, name: "Especiales" }, { season_number: 1, name: "Temporada 1" }, { season_number: 2, name: "Temporada 2" }];
const GOOD_LINK = "https://t.me/c/2229558644/12345";

let view;
let submitted;
afterEach(() => {
  view?.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(props, settings = SETTINGS) {
  submitted = [];
  fakeApi({ "GET /api/catalog": [], "GET /api/me": json({}, 401), "GET /api/settings": settings });
  const Host = defineComponent({ setup: () => () => h(LinkForm, { ...props, onSubmit: (body) => submitted.push(body) }) });
  view = await mountView(Host);
  return view;
}

const field = (selector) => view.root.querySelector(selector);
const submitButton = () => view.root.querySelector("button[type=submit]");

async function submit() {
  field("form").dispatchEvent(new Event("submit"));
  await settle(1);
}

describe("LinkForm", () => {
  it("builds a movie link from the settings' qualities and languages", async () => {
    await mount({ type: "movie", submitLabel: "Añadir" });
    expect([...view.root.querySelectorAll("select option")].map((o) => o.value)).toEqual(["1080p", "4K"]);
    expect(view.root.querySelectorAll("input[type=checkbox]")).toHaveLength(6);
    expect(submitButton().disabled).toBe(true);
    type(field("input[type=url]"), GOOD_LINK);
    field("select").value = "4K";
    field("select").dispatchEvent(new Event("change"));
    const audio = field('input[type=checkbox][value="Japonés"]');
    audio.checked = true;
    audio.dispatchEvent(new Event("change"));
    type(field('input[placeholder="HDR, REMUX"]'), "HDR, REMUX");
    await settle(1);
    expect(submitButton().disabled).toBe(false);
    await submit();
    expect(submitted).toEqual([{ quality: "4K", audio: ["Japonés"], subs: [], tags: ["HDR", "REMUX"], link: GOOD_LINK }]);
  });

  it("checks the Telegram link with the site's rules", async () => {
    await mount({ type: "movie" });
    type(field("input[type=url]"), "https://t.me/+abc");
    await settle(1);
    expect(field(".form__error").textContent).toContain("invitación");
    type(field("input[type=url]"), "https://t.me/c/999/1");
    await settle(1);
    expect(field(".form__error").textContent).toContain("ninguno de los grupos");
    expect(submitButton().disabled).toBe(true);
  });

  it("starts series at their first real season and takes any other number", async () => {
    await mount({ type: "series", seasons: SEASONS });
    const season = field("select");
    expect(season.value).toBe("1");
    expect([...season.options].map((o) => o.value)).toEqual(["0", "1", "2", "all", "other"]);
    season.value = "other";
    season.dispatchEvent(new Event("change"));
    await settle(1);
    type(field('input[aria-label="Número de temporada"]'), "5");
    type(field("input[type=url]"), GOOD_LINK);
    await settle(1);
    await submit();
    expect(submitted[0].season).toBe(5);
  });

  it("fills an existing link, keeping a season TMDB does not list", async () => {
    await mount({
      type: "series",
      seasons: [],
      cancellable: true,
      initial: { season: "3", quality: "4K", audio: ["Inglés"], subs: ["Forzados"], tags: "HDR", link: GOOD_LINK },
    });
    expect(field("select").value).toBe("other");
    expect(field('input[aria-label="Número de temporada"]').value).toBe("3");
    expect(field('input[type=checkbox][value="Forzados"]').checked).toBe(true);
    expect(button(view.root, "Cancelar")).not.toBeNull();
    await submit();
    expect(submitted).toEqual([{ season: 3, quality: "4K", audio: ["Inglés"], subs: ["Forzados"], tags: ["HDR"], link: GOOD_LINK }]);
  });

  it("lets the user retry when the settings fail to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount({ type: "movie" }, json({ error: 'setting "groups" is not configured' }, 503));
    expect(view.root.querySelector("form")).toBeNull();
    expect(button(view.root, "Reintentar")).not.toBeNull();
  });
});
