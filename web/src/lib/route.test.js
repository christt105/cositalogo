import { describe, expect, it } from "vitest";
import { gridHash, nextPath, queryParams, withNext } from "./route.js";

describe("queryParams", () => {
  it("keeps every value and drops the empty ones", () => {
    const params = queryParams({ q: "a b", tag: ["x", "y"], flag: null });
    expect(params.get("q")).toBe("a b");
    expect(params.getAll("tag")).toEqual(["x", "y"]);
    expect(params.has("flag")).toBe(false);
  });
});

describe("gridHash", () => {
  it("keeps the search in the query", () => {
    expect(gridHash("")).toBe("#/");
    expect(gridHash("señor & co")).toBe("#/?q=se%C3%B1or+%26+co");
  });
});

describe("withNext and nextPath", () => {
  it("carry the path to go back to", () => {
    expect(withNext("/login", "/movie/550")).toBe("#/login?next=%2Fmovie%2F550");
    expect(nextPath(new URLSearchParams("next=%2Fmovie%2F550"))).toBe("/movie/550");
  });

  it("leave out the grid and ignore anything that is not a path", () => {
    expect(withNext("/login", "/")).toBe("#/login");
    expect(nextPath(new URLSearchParams("next=https://evil.example"))).toBe("/");
    expect(nextPath(new URLSearchParams(""))).toBe("/");
  });
});
