# telegram-scan

Rescans the General group's topics (Películas, Series, Películas 4K), parses
every cover post and matches it against TMDB with strict rules, then plans
and applies the changes to the catalog without touching anything a person
has edited. Safe to run again: it only adds new posts, and it only revisits
links it wrote itself (tagged `auto`) or that came from the old bulk import.

Python 3.12 with Telethon for reading Telegram; Node 22 for applying.

## Steps

```sh
pip install -r requirements.txt

# 1. Log in once with a Telegram user account that is in the group
#    (TELEGRAM_API_ID / TELEGRAM_API_HASH from my.telegram.org).
COSITALOGO_TG_SESSION=~/telegram python login.py

# 2. Dump the topics (read only).
python fetch.py topics 2229558644
python fetch.py dump 2229558644 2 4 16088 --out cache

# 3. Parse and match (TMDB_API_KEY; responses are cached in cache/tmdb).
python scan.py cache scan.json

# 4. Read the current catalog and plan, still without writing.
node ../cositalogo-api/backup/export.js d1-export      # CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
python plan.py scan.json d1-export plan.json [--protected legacy.json]
python report.py scan.json plan.json d1-export report.md cache/tmdb

# 5. Apply to a local copy (wrangler dev's D1, restored from d1-export),
#    check the web, and record the writes.
node apply.js plan.json <local.sqlite> --record apply.sql

# 6. Production, on a database still in the same state as the export
#    (the first statement of apply.sql aborts otherwise).
wrangler d1 execute cositalogo --remote --file apply.sql
```

## Matching

Each cover is matched by the first rule that gives exactly one title:

| Status | Rule | Used for |
|---|---|---|
| `file_id` | `[tmdbid-N]` in the file names, and that title agrees with the post | recast, add |
| `synopsis` | the post's synopsis shares most words with one result's overview | recast, add |
| `title_year` | exact title and year | recast, add |
| `year_only_result` | searching title + year gives a single result | recast, add |
| `only_result` | no year, a single result with the exact title | recast, add |
| `title_year_votes` | several exact title + year, one with 10× the votes | recast, add, tagged |
| `title_votes` | no year, several exact titles, one with 10× the votes | suggestion only |

Anything else (`ambiguous`, `title_mismatch`, `year_mismatch`,
`no_results`, `file_id_mismatch`) picks nothing: an existing link stays
where it is with `auto` and `dudoso`, and a new post is listed in the report for a
person. Results released after the post are ignored.

## What the plan does

- Links a person touched (added from the web, any audit row about the link
  or its title other than the scan's own, or listed in `--protected`) only
  get their date fixed.
- Every link gets `created_at` = when its message was posted; titles move
  back to their oldest link, so the catalog's newest-first order follows
  Telegram.
- Empty audio and subtitles are filled from the post; languages the
  catalog's settings do not list are dropped.
- New, recast and doubtful links get the `auto` tag, doubtful ones also
  `dudoso`; links confirmed by a strong rule get neither. Only members see
  these tags in the web, and checking a link there (or editing or moving it)
  clears them.
- Links whose message no longer exists are listed with a possible repost,
  never changed.

`apply.js` runs the plan through the API's own functions as user `0`, so
each change shows in the admin activity and can be undone from there.
