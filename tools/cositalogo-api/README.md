# Cositálogo API

Cloudflare Worker with a D1 database that will replace GitHub issues as the
catalog's source of truth. Nothing consumes it yet: the site still reads the
`catalog.json` built from the YAML files, and this Worker is not deployed.

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET /api/catalog` | anyone | Whole catalog, same shape as `site/catalog.json`, with `ETag` and 304 |
| `GET /api/titles/:type/:id` | anyone | `{ entry, detail }` for one title (`type` is `movie` or `series`) |
| `POST /api/links` | member | Add a link `{ type, tmdb, season?, quality, audio?, subs?, tags?, link }`; the title is fetched from TMDB the first time |
| `PATCH /api/links/:id` | member | Change any of `season`, `quality`, `audio`, `subs`, `tags`, `link` |
| `DELETE /api/links/:id` | author or admin | Delete a link; a title with no links left disappears |
| `POST /api/links/:id/move` | author or admin | Move a link to `{ type, tmdb, season? }` |
| `PUT /api/titles/:type/:id/poster` | member | `{ poster, season? }` sets a manual poster, `poster: null` clears it |

Writes need a session cookie (`s`) signed with `SESSION_SECRET` and a JSON
body. Issuing that cookie (Telegram login and group membership) is not part of
this Worker yet, so in practice nobody can write. Every write lands in the
`audit` table in the same transaction, with the value before and after.

Links are validated with the same rules as the YAML files
(`scripts/validation.js`). Qualities, Telegram groups and languages come from
the `settings` table (keys `qualities`, `groups`, `languages`, JSON values with
the same content as the YAML files); writes answer 503 while any is missing.

## How the catalog is served

The free plan allows 10 ms of CPU per request, and building the ~1 MB catalog
in the Worker takes longer than that. Instead, each `titles` row keeps its
catalog entry as a JSON fragment (`json`), a write rebuilds only the fragment
of the title it touched, and SQLite concatenates all fragments into the
one-row `snapshot` table inside D1. `GET /api/catalog` reads only the snapshot
version on each request and keeps the body in memory until it changes.
Compression is left to Cloudflare's edge. The Cache API is not used because it
does nothing on `workers.dev`.

## Local development

```sh
cd tools/cositalogo-api
printf 'TMDB_API_KEY=...\nSESSION_SECRET=any-local-secret\n' > .dev.vars
XDG_CONFIG_HOME=~/scratch/xdg wrangler d1 migrations apply cositalogo --local
XDG_CONFIG_HOME=~/scratch/xdg wrangler d1 execute cositalogo --local \
  --command "INSERT INTO settings VALUES ('qualities', '[\"1080p\",\"4K\"]')"  # and groups, languages
XDG_CONFIG_HOME=~/scratch/xdg wrangler dev
```

A session cookie for local testing can be signed with `signSession` from
`src/session.js`. The tests (`test/cositalogo-api.test.js`) run the Worker
against an in-memory SQLite with the real migrations (`test/d1-shim.js`), so
they need Node 22 or later for `node:sqlite`.

## Not done yet

Creating the D1 database and deploying need the Cloudflare account, so
`database_id` is still `REPLACE_ME` and there is no deploy workflow. The import
of the current YAML files, the Telegram login, admin management and rate
limiting are separate steps.
