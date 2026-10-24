"""Parse the dumped topics and match every cover post against TMDB.

Usage: python scan.py <cache_dir> <out.json>

Reads the <group>-<topic>.json files written by fetch.py for the topics in
TOPICS and writes one row per cover post: parsed fields plus the TMDB decision.
Needs TMDB_API_KEY; TMDB responses are cached under <cache_dir>/tmdb.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from match import LEVELS, match
from parse import group_covers, parse_cover
from tmdb import Tmdb

GROUP = 2229558644
TOPICS = {
    2: {"type": "movie", "quality": "1080p"},
    4: {"type": "series", "quality": "1080p"},
    16088: {"type": "movie", "quality": "4K"},
}


def scan_topic(tmdb, cache_dir, topic_id, config):
    messages = json.loads((cache_dir / f"-100{GROUP}-{topic_id}.json").read_text())
    covers = [parse_cover(entry, config["type"], config["quality"]) for entry in group_covers(messages)]
    kind = "movie" if config["type"] == "movie" else "tv"
    with ThreadPoolExecutor(6) as pool:
        decisions = list(pool.map(lambda cover: match(tmdb, kind, cover), covers))
    return [
        {
            **cover,
            "type": config["type"],
            "url": f"https://t.me/c/{GROUP}/{topic_id}/{cover['message_id']}",
            "link_key": f"https://t.me/c/{GROUP}/{cover['message_id']}",
            "match": {**decision, "level": LEVELS.get(decision["status"])},
        }
        for cover, decision in zip(covers, decisions)
    ]


def main(cache_dir, out_path):
    cache_dir = Path(cache_dir)
    tmdb = Tmdb(cache_dir / "tmdb")
    rows = []
    for topic_id, config in TOPICS.items():
        rows += scan_topic(tmdb, cache_dir, topic_id, config)
    Path(out_path).write_text(json.dumps(rows, ensure_ascii=False, indent=1))
    print(f"{len(rows)} cover posts -> {out_path}")


if __name__ == "__main__":
    main(*sys.argv[1:])
