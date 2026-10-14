import { describe, expect, it } from "vitest";
import { gridHash, parseHash } from "./route.js";

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
