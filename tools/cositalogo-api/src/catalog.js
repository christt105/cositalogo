import { TELEGRAM_LINK_RE } from "../../../site/rules.js";
import { json } from "./http.js";

const ALL_SEASONS_NAME = "Serie completa";

const parse = (text, fallback) => (text ? JSON.parse(text) : fallback);

/** The stored season value ("all" or an integer as text) as the catalog shows it. */
export const seasonValue = (stored) => (stored === null ? undefined : /^\d+$/.test(stored) ? Number(stored) : stored);

function groupName(url, groups) {
  const match = TELEGRAM_LINK_RE.exec(url);
  return match ? groups[match[1]] : undefined;
}

/**
 * The catalog entry of a title, with the same shape and field order as the
 * one scripts/build.js writes to catalog.json, from its `titles` row and
 * its `links` rows in insertion order.
 */
export function titleEntry(title, links, { qualities, groups }) {
  const isSeries = title.type === "series";
  const poster = title.poster ?? title.tmdb_poster;
  const seasons = parse(title.seasons, {});
  const seasonPosters = parse(title.season_posters, {});
  const entryLinks = links.map((l) => {
    const base = {
      quality: l.quality,
      audio: parse(l.audio, []),
      subs: parse(l.subs, []),
      tags: parse(l.tags, []),
      group: groupName(l.url, groups),
      link: l.url,
    };
    if (!isSeries) return base;
    const season = seasonValue(l.season);
    const info = seasons[l.season];
    const name = l.season === "all" ? ALL_SEASONS_NAME : info?.name ?? `Temporada ${l.season}`;
    const seasonPoster = seasonPosters[l.season] ?? info?.poster ?? poster;
    return { season, seasonName: name, seasonPoster, ...base };
  });
  const present = new Set(entryLinks.map((l) => l.quality));
  return {
    type: title.type,
    tmdb: title.tmdb_id,
    imdb: title.imdb ?? null,
    title: title.title,
    originalTitle: title.original_title,
    ...(title.english_title ? { englishTitle: title.english_title } : {}),
    year: title.year ?? null,
    poster,
    qualities: qualities.filter((q) => present.has(q)),
    genres: parse(title.genres, []),
    links: entryLinks,
  };
}

const linksStamp = (links) => (links.length ? links.map((l) => `${l.id}:${l.updated_at}`).join(",") : null);

/**
 * Rebuilds the catalog fragment of one title and then the whole snapshot.
 * The fragment is only stored if neither the title row nor its links
 * changed since they were read, retrying otherwise, so two concurrent
 * writes cannot leave a stale fragment behind. The snapshot is concatenated
 * inside SQLite so the full catalog never travels through the Worker; that
 * keeps a write within the free plan's CPU budget.
 */
export async function refreshTitle(db, type, tmdbId, settings, now = Date.now()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [titleRes, linksRes] = await db.batch([
      db.prepare("SELECT * FROM titles WHERE type = ? AND tmdb_id = ?").bind(type, tmdbId),
      db.prepare("SELECT * FROM links WHERE type = ? AND tmdb_id = ? ORDER BY id").bind(type, tmdbId),
    ]);
    const title = titleRes.results[0];
    if (!title) {
      await snapshotStatement(db, now).run();
      return;
    }
    const links = linksRes.results;
    const fragment = JSON.stringify(titleEntry(title, links, settings));
    const [update] = await db.batch([
      db.prepare(
        "UPDATE titles SET json = ?, updated_at = ? WHERE type = ? AND tmdb_id = ? AND updated_at = ? " +
          "AND (SELECT group_concat(id || ':' || updated_at, ',' ORDER BY id) FROM links WHERE type = ? AND tmdb_id = ?) IS ?"
      ).bind(fragment, Math.max(now, title.updated_at + 1), type, tmdbId, title.updated_at, type, tmdbId, linksStamp(links)),
      snapshotStatement(db, now),
    ]);
    if (update.meta.changes === 1) return;
  }
  throw new Error(`could not refresh ${type}:${tmdbId}, it kept changing`);
}

/** The statement that concatenates the fragments into the snapshot; `onlyIfChanged` leaves an identical snapshot alone, version included. */
export function snapshotSql({ onlyIfChanged = false } = {}) {
  return (
    "INSERT INTO snapshot (id, version, body) " +
    "SELECT 1, max(?, coalesce((SELECT version FROM snapshot WHERE id = 1), 0) + 1), '[' || coalesce(group_concat(json, ',' ORDER BY created_at DESC, type, tmdb_id), '') || ']' FROM titles WHERE true " +
    "ON CONFLICT (id) DO UPDATE SET version = excluded.version, body = excluded.body" +
    (onlyIfChanged ? " WHERE snapshot.body IS NOT excluded.body" : "")
  );
}

export function snapshotStatement(db, version = Date.now()) {
  return db.prepare(snapshotSql()).bind(version);
}

let memo = null;

export function clearCatalogMemo() {
  memo = null;
}

/**
 * Serves the snapshot. Each request reads only the one-row version; the
 * body is kept in the isolate until it changes, and browsers revalidate
 * with the ETag. Compression is left to Cloudflare's edge.
 */
export async function serveCatalog(request, db) {
  const head = await db.prepare("SELECT version FROM snapshot WHERE id = 1").first();
  const version = head?.version ?? 0;
  if (request.headers.get("if-none-match") === `"${version}"`) {
    return new Response(null, { status: 304, headers: { etag: `"${version}"`, "cache-control": "no-cache" } });
  }
  if (!memo || memo.version !== version) {
    const row = await db.prepare("SELECT version, body FROM snapshot WHERE id = 1").first();
    memo = { version: row?.version ?? 0, body: row?.body ?? "[]" };
  }
  return new Response(memo.body, {
    headers: { "content-type": "application/json; charset=utf-8", etag: `"${memo.version}"`, "cache-control": "no-cache" },
  });
}

/** A title's catalog entry and its detail, spliced from the stored JSON without parsing it. */
export async function serveTitle(db, type, tmdbId) {
  const row = await db.prepare("SELECT json, detail FROM titles WHERE type = ? AND tmdb_id = ?").bind(type, tmdbId).first();
  if (!row) return json({ error: "not found" }, 404);
  return new Response(`{"entry":${row.json},"detail":${row.detail}}`, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" },
  });
}
