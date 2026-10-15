import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, ref } from "vue";
import PosterPicker from "./PosterPicker.vue";
import { button, settle } from "../test/helpers.js";

const poster = (n) => ({ value: `https://img.test/w342/${n}.jpg`, thumb: `https://img.test/w185/${n}.jpg` });
const GROUPS = [
  { key: "es", label: "Castellano", posters: Array.from({ length: 14 }, (_, i) => poster(`es${i}`)) },
  { key: "en", label: "Inglés", posters: [poster("en0")] },
];

let app;
let root;
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.restoreAllMocks();
});

async function mount(loadPosters) {
  const model = ref(null);
  root = document.createElement("div");
  document.body.append(root);
  app = createApp({
    render: () => h(PosterPicker, {
      type: "movie", tmdb: 603, defaultPoster: "https://img.test/default.jpg", originalLanguage: "en", loadPosters,
      modelValue: model.value, "onUpdate:modelValue": (v) => (model.value = v),
    }),
  });
  app.mount(root);
  await settle();
  return model;
}

describe("PosterPicker", () => {
  it("loads the posters of the title and starts on the default", async () => {
    const load = vi.fn(async () => GROUPS);
    await mount(load);
    expect(load).toHaveBeenCalledWith("movie", 603, "en");
    expect(root.querySelector(".poster-default .poster").classList.contains("is-active")).toBe(true);
    expect([...root.querySelectorAll(".poster-tab")].map((t) => t.textContent.trim())).toEqual(["Castellano 14", "Inglés 1"]);
    expect(root.querySelectorAll(".poster-grid .poster")).toHaveLength(12);
  });

  it("pages through a group, switches groups and picks a poster", async () => {
    const model = await mount(async () => GROUPS);
    button(root, "Ver más (2)").click();
    await settle(1);
    expect(root.querySelectorAll(".poster-grid .poster")).toHaveLength(14);
    root.querySelectorAll(".poster-tab")[1].click();
    await settle(1);
    root.querySelector(".poster-grid .poster").click();
    await settle(1);
    expect(model.value).toBe("https://img.test/w342/en0.jpg");
    root.querySelector(".poster-default .poster").click();
    await settle(1);
    expect(model.value).toBeNull();
  });

  it("shows nothing when TMDB has no posters or fails", async () => {
    await mount(async () => []);
    expect(root.querySelector(".poster-picker")).toBeNull();
    app.unmount();
    root.remove();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount(async () => {
      throw new Error("down");
    });
    expect(root.querySelector(".poster-picker")).toBeNull();
  });
});
