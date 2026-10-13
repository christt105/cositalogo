import { HttpError } from "./http.js";

const KEYS = ["qualities", "groups", "languages"];
const TTL_MS = 60_000;

let cached = null;

/**
 * Qualities, Telegram groups and languages, the same values the YAML files
 * hold today, read from the `settings` table and kept in the isolate for a
 * minute. Fails with a 503 while any of them is missing, so nothing is
 * written against an empty configuration.
 */
export async function loadSettings(db, now = Date.now()) {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const value = Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)]));
  for (const key of KEYS) {
    if (value[key] === undefined) throw new HttpError(503, `setting "${key}" is not configured`);
  }
  cached = { at: now, value };
  return value;
}

export function clearSettingsCache() {
  cached = null;
}
