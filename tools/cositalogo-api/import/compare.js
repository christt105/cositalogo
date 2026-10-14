import { readFileSync } from "node:fs";
import { isEntrypoint } from "../../../scripts/lib.js";

const keyOf = (entry) => `${entry.type}:${entry.tmdb}`;

async function load(source) {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`${source} answered ${res.status}`);
    return res.json();
  }
  return JSON.parse(readFileSync(source, "utf8"));
}

/** An entry with `qualities` sorted, since only the set of qualities is meaningful. */
const comparable = (entry) => ({ ...entry, qualities: [...entry.qualities].sort() });

function diffFields(a, b) {
  const fields = [];
  for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) fields.push(field);
  }
  return fields;
}

/**
 * The differences between the catalog the API serves (`actual`) and the one
 * the build publishes (`expected`): titles on one side only, titles whose
 * entry differs (with the fields that do), and whether the titles come in a
 * different order. The order of `qualities` inside an entry is ignored.
 */
export function compareCatalogs(expected, actual) {
  const wanted = new Map(expected.map((e) => [keyOf(e), comparable(e)]));
  const served = new Map(actual.map((e) => [keyOf(e), comparable(e)]));
  const missing = [...wanted.keys()].filter((k) => !served.has(k));
  const extra = [...served.keys()].filter((k) => !wanted.has(k));
  const changed = [];
  for (const [key, entry] of wanted) {
    const other = served.get(key);
    if (other && JSON.stringify(entry) !== JSON.stringify(other)) changed.push({ key, fields: diffFields(entry, other) });
  }
  const common = (list, other) => list.map(keyOf).filter((k) => other.has(k));
  const sameOrder = JSON.stringify(common(expected, served)) === JSON.stringify(common(actual, wanted));
  return { missing, extra, changed, sameOrder, equal: !missing.length && !extra.length && !changed.length };
}

export function formatReport({ missing, extra, changed, sameOrder, equal }, limit = 20) {
  const lines = [];
  const list = (label, items) => {
    if (!items.length) return;
    lines.push(`${label}: ${items.length}`);
    for (const item of items.slice(0, limit)) lines.push(`  ${item}`);
    if (items.length > limit) lines.push(`  ... and ${items.length - limit} more`);
  };
  list("only in the published catalog", missing);
  list("only in the API", extra);
  list("different", changed.map((c) => `${c.key} (${c.fields.join(", ")})`));
  lines.push(equal ? "catalogs match" : "catalogs differ");
  if (!sameOrder) lines.push("note: the titles come in a different order");
  return lines.join("\n");
}

async function main() {
  const [expectedSource, actualSource] = process.argv.slice(2);
  if (!expectedSource || !actualSource) {
    console.error("usage: node compare.js <published catalog.json or URL> <API catalog or URL, e.g. https://.../api/catalog>");
    process.exit(2);
  }
  const report = compareCatalogs(await load(expectedSource), await load(actualSource));
  console.log(formatReport(report));
  process.exit(report.equal ? 0 : 1);
}

if (isEntrypoint(import.meta.url)) {
  await main();
}
