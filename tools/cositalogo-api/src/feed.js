const FEED_ITEMS = 50;
const DAY_MS = 86400e3;
const CHANNEL_TITLE = "Cositálogo: nuevas versiones";

/**
 * Escapes text for XML content or attribute values and drops the characters
 * XML 1.0 cannot carry at all.
 */
export function xmlEscape(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const unique = (values) => [...new Set(values)];

function parseList(text) {
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function overview(detail) {
  try {
    const value = JSON.parse(detail)?.overview;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function buildItem(origin, row) {
  const links = parseList(row.links).sort((a, b) => b.id - a.id);
  const qualities = unique(links.map((l) => l.quality));
  const audio = unique(links.flatMap((l) => l.audio ?? []));
  const subs = unique(links.flatMap((l) => l.subs ?? []));
  const seasons = unique(links.map((l) => l.season).filter((s) => s !== null && s !== undefined));
  const summary = [
    `Calidad: ${qualities.join(", ")}`,
    seasons.length ? `Temporada: ${seasons.join(", ")}` : null,
    audio.length ? `Audio: ${audio.join(", ")}` : null,
    subs.length ? `Subtítulos: ${subs.join(", ")}` : null,
  ].filter(Boolean).join(". ");
  const text = [overview(row.detail), summary].filter(Boolean).join("\n\n");
  const url = `${origin}/${row.type}/${row.tmdb_id}`;
  const poster = row.poster ?? row.tmdb_poster;
  const name = row.year ? `${row.title} (${row.year})` : row.title;
  return [
    "<item>",
    `<title>${xmlEscape(`${name} · ${qualities.join(", ")}`)}</title>`,
    `<link>${xmlEscape(url)}</link>`,
    `<guid isPermaLink="false">${xmlEscape(`${row.type}:${row.tmdb_id}:${row.last_id}`)}</guid>`,
    `<pubDate>${new Date(row.last_at).toUTCString()}</pubDate>`,
    `<description>${xmlEscape(text)}</description>`,
    poster ? `<media:thumbnail url="${xmlEscape(poster)}"/>` : null,
    "</item>",
  ].filter(Boolean).join("");
}

/**
 * Builds the RSS 2.0 document for `rows` (see `serveFeed`). Pure, so the
 * document can be checked without a database.
 */
export function renderFeed(origin, rows) {
  const updated = rows.length ? new Date(rows[0].last_at).toUTCString() : new Date(0).toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">',
    "<channel>",
    `<title>${xmlEscape(CHANNEL_TITLE)}</title>`,
    `<link>${xmlEscape(`${origin}/`)}</link>`,
    "<description>Las últimas películas y series con enlaces nuevos.</description>",
    "<language>es</language>",
    `<lastBuildDate>${updated}</lastBuildDate>`,
    `<atom:link href="${xmlEscape(`${origin}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    ...rows.map((row) => buildItem(origin, row)),
    "</channel>",
    "</rss>",
  ].join("\n");
}

/**
 * Serves `GET /feed.xml`: the latest new versions, one item per title and UTC
 * day, as RSS 2.0. A single query groups the links of a title added on the
 * same UTC day. Telegram URLs are never selected.
 */
export async function serveFeed(request, db) {
  const origin = new URL(request.url).origin;
  const { results } = await db.prepare(
    `SELECT t.type, t.tmdb_id, t.title, t.year, t.poster, t.tmdb_poster, t.detail,
            MAX(l.id) AS last_id, MAX(l.created_at) AS last_at,
            json_group_array(json_object('id', l.id, 'quality', l.quality, 'season', l.season,
                                         'audio', json(l.audio), 'subs', json(l.subs))) AS links
     FROM links l JOIN titles t ON t.type = l.type AND t.tmdb_id = l.tmdb_id
     GROUP BY l.type, l.tmdb_id, l.created_at / ${DAY_MS}
     ORDER BY last_at DESC, last_id DESC
     LIMIT ?`,
  ).bind(FEED_ITEMS).all();
  return new Response(renderFeed(origin, results), {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
