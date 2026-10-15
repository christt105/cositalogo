import { describe, expect, it } from "vitest";
import { linkBody, linkFields, parseTags } from "./links.js";

const fields = { season: "2", quality: "4K", audio: ["Castellano"], subs: [], tags: " HDR,, REMUX ,HDR", link: " https://t.me/c/1/2 " };

describe("parseTags", () => {
  it("drops blanks and repeats", () => {
    expect(parseTags(" HDR,, REMUX ,HDR")).toEqual(["HDR", "REMUX"]);
    expect(parseTags("")).toEqual([]);
  });
});

describe("linkBody", () => {
  it("sends the season as a number only for series", () => {
    expect(linkBody("series", fields)).toEqual({ season: 2, quality: "4K", audio: ["Castellano"], subs: [], tags: ["HDR", "REMUX"], link: "https://t.me/c/1/2" });
    expect(linkBody("series", { ...fields, season: "all" }).season).toBe("all");
    expect(linkBody("movie", fields)).not.toHaveProperty("season");
  });
});

describe("linkFields", () => {
  it("round-trips an existing link through the form", () => {
    const link = { season: 0, quality: "1080p", audio: ["Inglés"], subs: ["Castellano"], tags: ["HDR"], link: "https://t.me/c/1/3" };
    expect(linkFields(link)).toEqual({ season: "0", quality: "1080p", audio: ["Inglés"], subs: ["Castellano"], tags: "HDR", link: "https://t.me/c/1/3" });
    expect(linkBody("series", linkFields(link))).toEqual(link);
    expect(linkFields({ ...link, season: undefined }).season).toBe("");
  });
});
