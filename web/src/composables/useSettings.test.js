import { afterEach, describe, expect, it, vi } from "vitest";
import { createSettings } from "./useSettings.js";

afterEach(() => vi.restoreAllMocks());

describe("createSettings", () => {
  it("loads once even when asked twice at the same time", async () => {
    const fetchSettings = vi.fn(async () => ({ qualities: ["4K"] }));
    const settings = createSettings(fetchSettings);
    expect(settings.status.value).toBe("idle");
    const [a, b] = await Promise.all([settings.load(), settings.load()]);
    expect(a).toEqual({ qualities: ["4K"] });
    expect(b).toBe(a);
    await settings.load();
    expect(fetchSettings).toHaveBeenCalledTimes(1);
    expect(settings.status.value).toBe("ready");
  });

  it("can be retried after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSettings = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ qualities: [] });
    const settings = createSettings(fetchSettings);
    expect(await settings.load()).toBeNull();
    expect(settings.status.value).toBe("error");
    await settings.load();
    expect(settings.status.value).toBe("ready");
  });
});
