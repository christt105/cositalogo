import { describe, expect, it } from "vitest";
import { gridHash, matchRoute, nextPath, parseHash, withNext } from "./route.js";

describe("parseHash", () => {
  it("treats an empty or bare hash as the grid", () => {
    expect(parseHash("").parts).toEqual([]);
    expect(parseHash("#/").parts).toEqual([]);
    expect(parseHash("#").parts).toEqual([]);
  });

  it("splits the path and the query", () => {
    const route = parseHash("#/movie/550?q=a+b");
    expect(route.parts).toEqual(["movie", "550"]);
    expect(route.params.get("q")).toBe("a b");
  });
});

describe("gridHash", () => {
  it("round-trips a search through parseHash", () => {
    expect(gridHash("")).toBe("#/");
    expect(parseHash(gridHash("señor & co")).params.get("q")).toBe("señor & co");
  });
});

describe("matchRoute", () => {
  const routes = [
    { path: "/", name: "grid" },
    { path: "/movie/:id", name: "movie", match: { id: /^\d+$/ } },
    { path: "/series/:id/:season", name: "season" },
  ];

  it("matches the grid only for an empty path", () => {
    expect(matchRoute(routes, [])).toEqual({ route: routes[0], params: {} });
  });

  it("captures the named segments", () => {
    expect(matchRoute(routes, ["movie", "550"])).toEqual({ route: routes[1], params: { id: "550" } });
    expect(matchRoute(routes, ["series", "1399", "2"]).params).toEqual({ id: "1399", season: "2" });
  });

  it("is null when nothing fits", () => {
    expect(matchRoute(routes, ["movie", "abc"])).toBeNull();
    expect(matchRoute(routes, ["movie"])).toBeNull();
    expect(matchRoute(routes, ["series", "1399"])).toBeNull();
  });
});

describe("withNext and nextPath", () => {
  it("carry the path to go back to", () => {
    expect(withNext("/login", "/movie/550")).toBe("#/login?next=%2Fmovie%2F550");
    expect(nextPath(parseHash(withNext("/login", "/movie/550")).params)).toBe("/movie/550");
  });

  it("leave out the grid and ignore anything that is not a path", () => {
    expect(withNext("/login", "/")).toBe("#/login");
    expect(nextPath(new URLSearchParams("next=https://evil.example"))).toBe("/");
    expect(nextPath(new URLSearchParams(""))).toBe("/");
  });
});
