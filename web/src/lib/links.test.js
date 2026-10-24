import { describe, expect, it } from "vitest";
import { linkBody, linkFields, linkFieldsFromQuery, parseTags, reviewState, shownTags } from "./links.js";

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

describe("review tags", () => {
  it("tells doubtful from merely automatic links", () => {
    expect(reviewState(["HDR", "auto", "dudoso"])).toBe("doubtful");
    expect(reviewState(["auto"])).toBe("auto");
    expect(reviewState(["HDR"])).toBeNull();
  });

  it("are never shown as tags nor put in the edit form", () => {
    expect(shownTags(["HDR", "auto", "dudoso"])).toEqual(["HDR"]);
    const link = { quality: "4K", audio: [], subs: [], tags: ["HDR", "auto"], link: "https://t.me/c/1/2" };
    expect(linkFields(link).tags).toBe("HDR");
  });
});

describe("linkFieldsFromQuery", () => {
  it("reads the fields the scan report puts in its links", () => {
    const query = new URLSearchParams("q=Luca&link=https%3A%2F%2Ft.me%2Fc%2F1%2F2%2F3&quality=4K&audio=Castellano,%20VO&subs=Castellano&season=2");
    expect(linkFieldsFromQuery(query)).toEqual({ link: "https://t.me/c/1/2/3", quality: "4K", season: "2", audio: ["Castellano", "VO"], subs: ["Castellano"] });
  });

  it("is null without any", () => {
    expect(linkFieldsFromQuery(new URLSearchParams("q=Luca"))).toBeNull();
  });
});
