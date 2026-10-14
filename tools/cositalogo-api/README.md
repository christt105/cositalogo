# Cositálogo API

Cloudflare Worker with a D1 database that will replace GitHub issues as the
catalog's source of truth. The public site on GitHub Pages still reads the
`catalog.json` built from the YAML files; the new web app in `web/` reads this
API and is served by this same Worker (see [Web app](#web-app)).

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
| `POST /api/login` | anyone | Starts a sign-in: `{ url, expiresAt }` with the bot deep link, plus a browser cookie |
| `POST /api/login/poll` | the browser that started it | 202 while pending, then the session cookie and `{ id, name, member, admin }`; 410 when expired |
| `POST /api/logout` | anyone | Clears the session cookie |
| `POST /api/telegram` | Telegram | Bot webhook, checked with the secret token |
| `GET /api/me` | signed in | `{ id, name, member, admin }` |
| `POST /api/unlock` | signed in | `{ password }` makes the user a member |
| `GET /api/members`, `DELETE /api/members/:id` | admin | List members, revoke one |
| `GET /api/admins`, `PUT /api/admins/:id`, `DELETE /api/admins/:id` | admin | List admins, promote a member, remove another admin |

Writes need a session cookie (`s`) signed with `SESSION_SECRET`, a JSON body
and the `member` role. Every write lands in the `audit` table in the same
transaction, with the value before and after.

## Sign-in and roles

Signing in goes through the Cositálogo bot, which only talks in private chats
and is not in any group:

1. `POST /api/login` stores a one-use nonce that expires in five minutes and
   answers with `https://t.me/<BOT_USERNAME>?start=login_<nonce>`. The browser
   also gets a secret in the `l` cookie, so someone who only sees the link
   cannot claim the session.
2. Pressing Start in Telegram sends `/start login_<nonce>` to the webhook,
   which records the sender's Telegram id and name and answers in the chat
   through the webhook response (the Worker never needs the bot token).
3. The page polls `POST /api/login/poll` and gets a 30-day session cookie.

The session only says who the user is. The roles live in D1 and are read on
every request, so revoking takes effect at once:

- `member`: can write. Signed-in users become members by sending the shared
  `WRITE_PASSWORD` to `POST /api/unlock`; wrong guesses are limited to five
  per user and hour. Changing the password does not remove existing members.
- `admin`: also a member, can delete or move anyone's links and manage members
  and admins. The first admin is added by hand:
  `wrangler d1 execute cositalogo --command "INSERT INTO admins (user_id, name, created_at) VALUES (<telegram id>, '<name>', 0)"`.

Secrets: `SESSION_SECRET`, `TELEGRAM_WEBHOOK_SECRET` (the `secret_token`
given to `setWebhook`), `WRITE_PASSWORD` and `TMDB_API_KEY`. `BOT_USERNAME` is
a plain variable in `wrangler.toml`.

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
printf 'TMDB_API_KEY=...\nSESSION_SECRET=any-local-secret\nTELEGRAM_WEBHOOK_SECRET=any\nWRITE_PASSWORD=any\n' > .dev.vars
XDG_CONFIG_HOME=~/scratch/xdg wrangler d1 migrations apply cositalogo --local
XDG_CONFIG_HOME=~/scratch/xdg wrangler d1 execute cositalogo --local \
  --command "INSERT INTO settings VALUES ('qualities', '[\"1080p\",\"4K\"]')"  # and groups, languages
npm run build:web   # from the repository root, see below
XDG_CONFIG_HOME=~/scratch/xdg wrangler dev
```

`wrangler dev` and `wrangler deploy` stop with "The directory specified by the
"assets.directory" field in your configuration file does not exist" until
the web app has been built at least once; the `d1` commands do not need it.

A session cookie for local testing can be signed with `signSession` from
`src/session.js`, or a sign-in can be completed by posting a fake update to
`/api/telegram` with the `x-telegram-bot-api-secret-token` header. The tests
(`test/cositalogo-api.test.js`, `test/cositalogo-auth.test.js`) run the Worker
against an in-memory SQLite with the real migrations (`test/d1-shim.js`), so
they need Node 22 or later for `node:sqlite`.

## Web app

`web/` is a Vue 3 app built with Vite (`vite.config.js` at the repository
root) into `tools/cositalogo-api/dist/`, which is gitignored and uploaded as
the Worker's [static assets](https://developers.cloudflare.com/workers/static-assets/).
`run_worker_first = ["/api/*"]` in `wrangler.toml` sends every API request
to the Worker before looking at the files, so a file can never shadow an
endpoint; any other path is served from the build, and one with no file
falls through to the Worker, which answers the usual JSON 404. Static files
do not run the Worker, so they cost no Worker CPU.

Serving the web from the API's own origin is what lets it sign in later: the
session cookie is `SameSite=Lax` and the API sends no CORS headers, so a page
on another site could neither send the cookie nor read the answers.

For now it is a read-only grid with search (`matchesSearch` from
`site/rules.js`) over `GET /api/catalog`, with the search kept in the hash
(`#/?q=...`). There is no service worker. `web/public/_headers` adds
`X-Robots-Tag: noindex` to every file (the page also has the `robots` meta)
and long-lived caching to the hashed files under `/assets/`.

`web/src/` is split by responsibility:

- `api/`: `client.js` makes every call (same origin, JSON bodies with their
  content type, errors as `ApiError` with the `status`), with one function
  per resource on top (`getCatalog`, `getTitle`).
- `composables/`: reactive state. `useCatalog` is created once in `App.vue`
  and shared with `provide`/`inject`; it holds the titles, an index by
  `type/tmdb`, the loading status and `reload()`.
- `views/`: one per route, listed in `routes.js`; `lib/route.js` matches the
  hash against that table and anything else shows `NotFoundView`.
- `components/`: pieces of a screen.
- `lib/`: plain functions without Vue.

```sh
npm run build:web    # writes tools/cositalogo-api/dist
npm run dev:web      # Vite dev server, proxies /api to wrangler dev on :8787
npm run test:web     # Vitest + happy-dom
```

`npm run dev:web` needs `wrangler dev` running on its default port; Vite's
dev server does not apply `_headers`.

## Deploying

`.github/workflows/deploy-cositalogo-api.yml` runs the tests (`npm test` and
`npm run test:web`), builds the web app, applies pending D1 migrations,
deploys the Worker with the web as its assets and then checks that
`/api/catalog`, a missing title and the web page answer as expected. It runs
on every push to `main` that touches the Worker's code, migrations,
`wrangler.toml`, `web/`, `vite.config.js` or the shared `site/rules.js` and
`scripts/validation.js`, and can be run by hand. Deploying by hand needs
`npm run build:web` first. The Worker's secrets live in
Cloudflare (`wrangler secret put`) and survive deploys, so the workflow does
not set them; the repository's `CLOUDFLARE_API_TOKEN` needs Workers and D1
edit access.

## Importing the YAML files

`import/import.js` turns `movies/`, `series/` and the config YAML files into
SQL that makes a D1 database hold exactly that, reusing the build's own title
loading and TMDB cache (`.cache/tmdb.json`; titles missing from it are fetched,
so `TMDB_API_KEY` is needed) and this Worker's `titleEntry` for the stored
fragments. Run it from the repository root:

```sh
set -a; . ~/.config/cositeca/tmdb.env; set +a
node tools/cositalogo-api/import/import.js --out import.sql     # --now <ms> pins the timestamps
cd tools/cositalogo-api
wrangler d1 execute cositalogo --local --file ../../import.sql   # or --remote
```

Until the cut-over the YAML files are the source of truth, so every run makes
D1 match them: titles and links that are new or changed are written, and
anything the files do not mention is deleted, including links added through the
API. Running it twice with the same files writes nothing (every statement is an
upsert guarded by a comparison, and the snapshot is only rebuilt when its body
changes). A title whose fragment changed has its links deleted and inserted
again so they keep the order of the file. Titles added in the same second get
`created_at` values a few milliseconds apart that reproduce the build's order.

`import/compare.js` checks a served catalog against the published one and lists
the titles that are missing, extra or different (with the fields), ignoring the
order of `qualities` and noting if the titles come in another order:

```sh
node tools/cositalogo-api/import/compare.js site/catalog.json http://localhost:8787/api/catalog
node tools/cositalogo-api/import/compare.js https://christt105.github.io/cositeca/catalog.json https://cositalogo-api.christt105.workers.dev/api/catalog
```

Differences against the published catalog are expected when the TMDB cache is
newer or older than the last deploy (a changed poster, for instance); compare
against a fresh `npm run build` to check the import itself.

## Backups

`backup/export.js` reads the production D1 through the Cloudflare API and
writes it as files: `titles/<type>/<tmdb id>.json` with the title row and its
links, `audit/<yyyy-mm>.json`, and `settings.json`, `admins.json` and
`members.json`. JSON columns are written parsed so a diff shows the change, and
the same data always gives the same files, so a nightly commit only happens
when something changed. Catalog fragments and the snapshot are left out
because a restore rebuilds them; login requests and password failures are not
kept. The token only needs D1 read access.

```sh
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node tools/cositalogo-api/backup/export.js <backup checkout>
```

`backup/restore.js` turns a backup into SQL that replaces the titles, links,
settings, admins, members and audit of a database and rebuilds every fragment
and the snapshot as the API would. Restore into an empty D1 first (`wrangler
d1 create`, then `wrangler d1 migrations apply`) and compare it with
`import/compare.js` before pointing anything at it:

```sh
node tools/cositalogo-api/backup/restore.js <backup checkout> --out restore.sql
cd tools/cositalogo-api
wrangler d1 execute <database> --remote --file ../../restore.sql
```

## Not done yet

Rate limiting of writes, and signing in and writing from the web app.
