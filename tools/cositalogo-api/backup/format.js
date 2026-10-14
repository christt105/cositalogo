/**
 * The layout of a backup: one file per title with its links, one file per
 * month of audit, and the settings, admins and members. Columns that hold
 * JSON text are written parsed so a diff shows the change itself. The
 * catalog fragment (`titles.json`) and the snapshot are left out because a
 * restore rebuilds them.
 */
export const TITLE_JSON = ["genres", "seasons", "season_posters", "detail"];
export const LINK_JSON = ["audio", "subs", "tags"];
export const AUDIT_JSON = ["before", "after"];

export const titlePath = (type, tmdbId) => `titles/${type}/${tmdbId}.json`;
export const auditPath = (at) => `audit/${new Date(at).toISOString().slice(0, 7)}.json`;
export const SINGLE_FILES = ["settings.json", "admins.json", "members.json"];
export const DIRECTORIES = ["titles", "audit"];

export const serialize = (value) => JSON.stringify(value, null, 2) + "\n";

const mapColumns = (row, columns, fn) => {
  const out = { ...row };
  for (const c of columns) if (out[c] !== null && out[c] !== undefined) out[c] = fn(out[c]);
  return out;
};

export const parseColumns = (row, columns) => mapColumns(row, columns, JSON.parse);
export const stringifyColumns = (row, columns) => mapColumns(row, columns, JSON.stringify);
