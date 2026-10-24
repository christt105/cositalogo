"""Turn a scan into catalog operations, without writing anything.

Usage: python plan.py <scan.json> <d1_export_dir> <plan.json> [--protected <legacy.json>]

<d1_export_dir> is what tools/cositalogo-api/backup/export.js writes. The
plan lists one operation per change, every link left alone and why, and the
cover posts that need a person; apply.js runs the operations.

A link is never moved or edited when a person has touched it: added from the
web, any audit row about it or its title other than the scan's own, or a key listed in --protected
(edits from before the audit existed). Only its date is fixed.
"""
import argparse
import collections
import json
from datetime import datetime
from pathlib import Path

from match import LEVELS

AUTO_TAG = "auto"
DOUBT_TAG = "dudoso"
REVIEW_TAGS = {AUTO_TAG, DOUBT_TAG}
SCAN_USER_ID = 0
RECAST_LEVELS = {"certain", "strong", "medium"}
TRUSTED_WITHOUT_TAG = {"certain", "strong"}
TRUSTED_STATUSES_WITHOUT_TAG = {"only_result"}
SCANNED_GROUP = "2229558644"
SCANNED_TOPICS = {"2", "4", "16088"}


def read_export(export_dir):
    links, titles = {}, {}
    for path in sorted((export_dir / "titles").glob("*/*.json")):
        data = json.loads(path.read_text())
        title = data["title"]
        titles[(title["type"], title["tmdb_id"])] = title
        for link in data["links"]:
            links[link["link_key"]] = {**link, "type": title["type"], "tmdb_id": title["tmdb_id"]}
    audit = []
    for path in sorted((export_dir / "audit").glob("*.json")):
        audit += json.loads(path.read_text())
    return links, titles, audit


def touched_by_people(links, audit, legacy):
    """Link keys a person has added, edited, moved or vouched for (by fixing its title's poster)."""
    by_id = {link["id"]: key for key, link in links.items()}
    by_title = collections.defaultdict(set)
    for key, link in links.items():
        by_title[(link["type"], link["tmdb_id"])].add(key)
    touched = {key for key, link in links.items() if link["added_by"] is not None} | set(legacy)
    for row in audit:
        if row["user_id"] == SCAN_USER_ID:
            continue
        kind, _, rest = row["target"].partition(":")
        if kind == "link":
            if int(rest) in by_id:
                touched.add(by_id[int(rest)])
        else:
            touched |= by_title.get((kind, int(rest.split(":")[0])), set())
    return touched


def millis(iso):
    return int(datetime.fromisoformat(iso).timestamp() * 1000)


def season_text(season):
    return None if season is None else str(season)


def wanted_fields(cover, link, languages):
    """Fields the post says the link should have; unknown parts keep what the link has.
    Languages the catalog does not list are dropped, as the API would reject them."""
    season = link.get("season") if link else None
    if cover["type"] == "series" and cover["season"] is not None:
        season = season_text(cover["season"])
    elif cover["type"] == "series" and season is None:
        season = "all"
    old_tags = [t for t in (link["tags"] if link else []) if t not in REVIEW_TAGS]
    tags = old_tags + [t for t in cover["tags"] if t not in old_tags]
    return {
        "season": season if cover["type"] == "series" else None,
        "quality": cover["quality"],
        "audio": [a for a in cover["audio"] if a in languages["audio"]] or (link["audio"] if link else []),
        "subs": [s for s in cover["subs"] if s in languages["subs"]] or (link["subs"] if link else []),
        "tags": tags,
    }


def with_review(tags, auto, doubtful=False):
    tags = [t for t in tags if t not in REVIEW_TAGS]
    return tags + [AUTO_TAG] * auto + [DOUBT_TAG] * doubtful


def doubt(cover):
    m = cover["match"]
    return {
        "status": m["status"],
        "query": m.get("query"),
        "suggested": m["tmdb_id"],
        "candidates": m.get("candidates", [])[:5],
    }


def plan(scan, links, audit, legacy, languages):
    touched = touched_by_people(links, audit, legacy)
    ops, kept, needs_person = [], [], []
    seen = set()
    counts = collections.Counter()

    for cover in scan:
        key = cover["link_key"]
        seen.add(key)
        link = links.get(key)
        m = cover["match"]
        level = LEVELS.get(m["status"]) if m["tmdb_id"] else None
        posted = millis(cover["date"])

        if link and link["created_at"] != posted:
            ops.append({"op": "date", "id": link["id"], "created_at": posted})
            counts["date"] += 1

        if link is None:
            if level in RECAST_LEVELS:
                fields = wanted_fields(cover, None, languages)
                ops.append({"op": "add", "type": cover["type"], "tmdb": m["tmdb_id"], "link": cover["url"],
                            "created_at": posted, "reason": m["status"], **fields, "tags": with_review(fields["tags"], True)})
                counts["add"] += 1
            else:
                needs_person.append({"link": cover["url"], "heading": cover["heading"], "posted": cover["date"][:10], **doubt(cover)})
                counts["missing_needs_person"] += 1
            continue

        if key in touched:
            kept.append({"id": link["id"], "link": cover["url"], "why": "touched_by_people"})
            counts["kept_touched_by_people"] += 1
            continue

        current = (link["type"], link["tmdb_id"])
        picked = (cover["type"], m["tmdb_id"]) if m["tmdb_id"] else None
        recast = level in RECAST_LEVELS and picked != current
        agrees = picked == current
        auto = recast or not agrees or not (level in TRUSTED_WITHOUT_TAG or m["status"] in TRUSTED_STATUSES_WITHOUT_TAG)
        fields = wanted_fields(cover, link, languages)
        fields["tags"] = with_review(fields["tags"], auto, doubtful=not recast and not agrees)

        if recast:
            ops.append({"op": "move", "id": link["id"], "type": cover["type"], "tmdb": m["tmdb_id"],
                        "season": fields["season"], "reason": m["status"],
                        "from": {"type": link["type"], "tmdb": link["tmdb_id"]}})
            counts["move"] += 1
        elif not agrees:
            counts["kept_doubtful"] += 1
            kept.append({"id": link["id"], "link": cover["url"], "why": "doubtful", "heading": cover["heading"],
                         "current": {"type": link["type"], "tmdb": link["tmdb_id"]}, **doubt(cover)})
        else:
            counts[f"confirmed_{'auto' if auto else 'trusted'}"] += 1

        changed = {f: v for f, v in fields.items()
                   if (v != link[f] or (recast and f == "tags")) and not (f == "season" and cover["type"] == "movie")}
        if changed:
            ops.append({"op": "update", "id": link["id"], "fields": changed})
            for f in changed:
                counts[f"update_{f}"] += 1

    for key, link in links.items():
        parts = link["url"].split("/")
        if key in seen or parts[4] != SCANNED_GROUP or (len(parts) > 6 and parts[5] not in SCANNED_TOPICS):
            continue
        kept.append({"id": link["id"], "link": link["url"], "why": "message_gone", "current": {"type": link["type"], "tmdb": link["tmdb_id"]},
                     "repost": repost_candidate(link, scan, links)})
        counts["message_gone"] += 1
    return {"ops": ops, "kept": kept, "needs_person": needs_person, "counts": dict(sorted(counts.items()))}


def repost_candidate(link, scan, links):
    """A later cover post of the same title and quality that is not in the catalog yet, if exactly one."""
    found = [c["url"] for c in scan
             if c["link_key"] not in links and c["match"]["tmdb_id"] == link["tmdb_id"]
             and c["type"] == link["type"] and c["quality"] == link["quality"]]
    return found[0] if len(found) == 1 else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scan", type=Path)
    parser.add_argument("export_dir", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--protected", type=Path)
    args = parser.parse_args()
    scan = json.loads(args.scan.read_text())
    links, _titles, audit = read_export(args.export_dir)
    legacy = json.loads(args.protected.read_text()) if args.protected else {}
    languages = json.loads((args.export_dir / "settings.json").read_text())["languages"]
    result = plan(scan, links, audit, legacy, languages)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    for name, count in result["counts"].items():
        print(f"{name}: {count}")


if __name__ == "__main__":
    main()
