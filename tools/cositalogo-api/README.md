# Cositálogo API

Cloudflare Worker with a D1 database that holds the catalog, the only source
of truth. The web app in `web/` (see its [README](../../web/README.md)) reads and
writes through this API and is served by this same Worker as static assets.

## Endpoints

| Method and path | Who | What |
|---|---|---|
| `GET /api/catalog` | anyone | Whole catalog as one JSON array, with `ETag` and 304 |
| `GET /api/titles/:type/:id` | anyone | `{ entry, detail }` for one title (`type` is `movie` or `series`) |
| `GET /api/titles/:type/:id/links` | signed in | The title's links with their `id`, in catalog order, each with `canDelete` for this user |
| `GET /api/settings` | anyone | `{ qualities, groups, languages }`, the values links are validated against; 503 while any is missing |
| `POST /api/links` | member | Add a link `{ type, tmdb, season?, quality, audio?, subs?, tags?, link, poster? }`; the title is fetched from TMDB the first time, and `poster` (a manual poster) is only accepted then, 409 if the title already exists |
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
| `GET /api/audit` | admin | The audit log, newest first: `{ entries, more }`; `?before=<id>` pages, `?title=movie:603` keeps one title and its links, `?limit=` up to 200 |
| `POST /api/audit/:id/undo` | admin | Undo one write (see [Undo](#undo)); answers `{ id }` of the audit row that undid it |

Writes need a session cookie (`s`) signed with `SESSION_SECRET`, a JSON body
and the `member` role. Every write lands in the `audit` table in the same
transaction, with the value before and after.

## Undo

Every write in `audit` keeps the value before and after. An admin can undo
an `add`, `update`, `move`, `delete` or `poster` row: the API makes the
opposite write through the same code as a normal one and logs it with
`reverts` set to the undone row, so `GET /api/audit` can show `undoneBy`.

- It only works while the link or poster is still exactly as that write
  left it; otherwise it answers 409 and the later writes have to be undone
  first, newest first.
- A row can be undone once. Undoing the undo row redoes the write.
- An undone delete gets its id back (and so its place in the title) unless a
  new link took it, and keeps its author and creation time. Deletes logged
  before `addedBy` was recorded take the author from the link's `add` row.
  A title that disappeared with its last link is fetched from TMDB again,
  without its manual poster; that comes back by undoing its own `poster`
  row, if there was one.
- Member and admin changes (`grant`, `revoke`) are not undone from here.

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

Links are validated by `src/validation.js` (quality, season, languages, tags
and a `https://t.me/c/<group>/[<topic>/]<message>` link from a known group;
the same message cannot be linked twice, whatever the topic). Qualities,
Telegram groups and languages come from the `settings` table (keys
`qualities`, `groups`, `languages`, JSON values); writes answer 503 while any
is missing. There is no screen to change them: edit the row with
`wrangler d1 execute`.

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
wrangler d1 migrations apply cositalogo --local
node backup/restore.js <backup checkout> --out restore.sql   # real data from the backup repository
wrangler d1 execute cositalogo --local --file restore.sql
npm run build:web   # from the repository root, see web/README.md
wrangler dev
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

## Deploying

The Worker is named `cositalogo` and lives on `workers.dev`. Its first name, `cositalogo-api`,
is kept by the small Worker in `legacy-redirect/`: API calls get a 308 to the
same path on the new origin and any other address a page that moves the
browser there keeping its `#/...` route. It has no workflow; deploy it by hand
from that folder with `wrangler deploy` if it ever changes.

`.github/workflows/deploy-cositalogo-api.yml` runs the tests (`npm test` and
`npm run test:web`), builds the web app, applies pending D1 migrations,
deploys the Worker with the web as its assets and then checks that
`/api/catalog`, a missing title and the web page answer as expected. It runs
on every push to `main` that touches the Worker's code, migrations,
`wrangler.toml`, `web/`, `vite.config.js` or `shared/`, and can be run by
hand. Deploying by hand needs
`npm run build:web` first. The Worker's secrets live in
Cloudflare (`wrangler secret put`) and survive deploys, so the workflow does
not set them; the repository's `CLOUDFLARE_API_TOKEN` needs Workers and D1
edit access.

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
d1 create`, then `wrangler d1 migrations apply`) and compare its
`/api/catalog` with production before pointing anything at it:

```sh
node tools/cositalogo-api/backup/restore.js <backup checkout> --out restore.sql
cd tools/cositalogo-api
wrangler d1 execute <database> --remote --file ../../restore.sql
```

## Not done yet

Rate limiting of writes.
