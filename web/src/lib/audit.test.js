import { describe, expect, it } from "vitest";
import { entryDetail, entryTitle, entryTitles, entryVerb, linkSummary, seasonLabel, titleNameFrom } from "./audit.js";

const link = { type: "series", tmdb: 1399, season: 1, quality: "1080p", audio: ["Castellano"], subs: ["Inglés"], tags: [], link: "https://t.me/c/1/2" };
const names = titleNameFrom(new Map([["series/1399", { title: "Juego de tronos" }]]));

describe("audit descriptions", () => {
  it("labels seasons and summarises links", () => {
    expect(seasonLabel(3)).toBe("T3");
    expect(seasonLabel("all")).toBe("Serie completa");
    expect(seasonLabel(undefined)).toBe("");
    expect(linkSummary(link)).toBe("T1 · 1080p · Castellano · subs Inglés");
  });

  it("names titles from the catalog, or by type and id once they are gone", () => {
    expect(names({ type: "series", tmdb: 1399 })).toBe("Juego de tronos");
    expect(names({ type: "movie", tmdb: 603 })).toBe("película 603");
  });

  it("lists only the fields an edit changed", () => {
    const entry = { action: "update", target: "link:5", before: link, after: { ...link, quality: "4K", tags: ["HDR"], season: "all", link: "https://t.me/c/1/3" } };
    expect(entryDetail(entry)).toBe("temporada: T1 → Serie completa; calidad: 1080p → 4K; etiquetas: nada → HDR; enlace cambiado");
    expect(entryTitle(entry)).toEqual({ type: "series", tmdb: 1399 });
  });

  it("says where a move went, naming both titles", () => {
    const entry = { action: "move", target: "link:5", before: link, after: { ...link, type: "movie", tmdb: 603, season: undefined } };
    expect(entryTitles(entry)).toEqual([{ type: "movie", tmdb: 603 }, { type: "series", tmdb: 1399 }]);
    expect(entryTitle(entry)).toBeNull();
    expect(entryVerb(entry)).toBe("Movió un enlace");
    expect(entryDetail(entry, names)).toBe("de Juego de tronos T1 a película 603");
  });

  it("describes adds, deletes, posters and access changes", () => {
    expect(entryDetail({ action: "add", target: "link:5", before: null, after: link })).toBe(linkSummary(link));
    expect(entryDetail({ action: "delete", target: "link:5", before: link, after: null })).toBe(linkSummary(link));
    const poster = { action: "poster", target: "series:1399:2", before: null, after: "https://x/p.jpg" };
    expect(entryTitle(poster)).toEqual({ type: "series", tmdb: 1399 });
    expect(entryDetail(poster)).toBe("T2: manual");
    expect(entryDetail({ action: "poster", target: "movie:603", before: "https://x/p.jpg", after: null })).toBe("la de TMDB");
    expect(entryVerb({ action: "grant" })).toBe("Dio acceso a");
    expect(entryDetail({ action: "grant", target: "admin:7", after: { name: "Ana" } })).toBe("Ana (admin)");
    expect(entryDetail({ action: "revoke", target: "member:7", before: { name: "" } })).toBe("member:7");
  });
});
