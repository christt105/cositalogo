import { describe, expect, it, vi } from "vitest";
import { getCatalog, getTitle } from "./catalog.js";
import { ApiError, request } from "./client.js";

const respond = (body, status = 200) => vi.fn(async () => new Response(body, { status }));

describe("request", () => {
  it("gets JSON from the same origin", async () => {
    const fetchImpl = respond('{"a":1}');
    expect(await request("/api/me", { fetchImpl })).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledWith("/api/me", { method: "GET" });
  });

  it("sends a body as JSON with its content type", async () => {
    const fetchImpl = respond('{"id":3}', 201);
    expect(await request("/api/links", { method: "POST", body: { tmdb: 550 }, fetchImpl })).toEqual({ id: 3 });
    expect(fetchImpl).toHaveBeenCalledWith("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"tmdb":550}',
    });
  });

  it("resolves to null when there is no answer", async () => {
    expect(await request("/api/links/1", { method: "DELETE", fetchImpl: respond(null, 204) })).toBeNull();
  });

  it("rejects with the status and the API's message", async () => {
    const err = await request("/api/unlock", { fetchImpl: respond('{"error":"wrong password"}', 403) }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe("wrong password");
  });

  it("falls back to the status when the answer is not JSON", async () => {
    const err = await request("/api/catalog", { fetchImpl: respond("oops", 502) }).catch((e) => e);
    expect(err.status).toBe(502);
    expect(err.message).toBe("/api/catalog: HTTP 502");
  });
});

describe("resources", () => {
  it("revalidates the catalog", async () => {
    const fetchImpl = respond("[1]");
    expect(await getCatalog({ fetchImpl })).toEqual([1]);
    expect(fetchImpl).toHaveBeenCalledWith("/api/catalog", { method: "GET", cache: "no-cache" });
  });

  it("gets one title", async () => {
    const fetchImpl = respond('{"entry":{}}');
    await getTitle("series", 1399, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("/api/titles/series/1399", { method: "GET", cache: "no-cache" });
  });
});
