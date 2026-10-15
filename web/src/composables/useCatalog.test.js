import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalog } from "./useCatalog.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => vi.restoreAllMocks());

describe("createCatalog", () => {
  it("loads the titles and indexes them by type and id", async () => {
    const catalog = createCatalog(async () => [{ type: "movie", tmdb: 550, title: "A" }]);
    expect(catalog.status.value).toBe("loading");
    await catalog.reload();
    expect(catalog.status.value).toBe("ready");
    expect(catalog.byKey.value.get("movie/550").title).toBe("A");
  });

  it("keeps the last good catalog when a reload fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn().mockResolvedValueOnce([{ type: "movie", tmdb: 1 }]).mockRejectedValueOnce(new Error("down"));
    const catalog = createCatalog(load);
    await catalog.reload();
    await catalog.reload();
    expect(catalog.status.value).toBe("ready");
    expect(catalog.items.value).toHaveLength(1);
  });

  it("is in error when the first load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const catalog = createCatalog(async () => {
      throw new Error("down");
    });
    await catalog.reload();
    expect(catalog.status.value).toBe("error");
  });

  it("keeps only the answer to the latest of overlapping reloads", async () => {
    const first = deferred();
    const second = deferred();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const catalog = createCatalog(load);
    const a = catalog.reload();
    const b = catalog.reload();
    second.resolve([{ type: "movie", tmdb: 2 }]);
    first.resolve([{ type: "movie", tmdb: 1 }]);
    await Promise.all([a, b]);
    expect(catalog.items.value).toEqual([{ type: "movie", tmdb: 2 }]);
  });
});
