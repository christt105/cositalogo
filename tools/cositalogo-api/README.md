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
XDG_CONFIG_HOME=~/scratch/xdg wrangler dev
```

A session cookie for local testing can be signed with `signSession` from
`src/session.js`, or a sign-in can be completed by posting a fake update to
`/api/telegram` with the `x-telegram-bot-api-secret-token` header. The tests
(`test/cositalogo-api.test.js`, `test/cositalogo-auth.test.js`) run the Worker
against an in-memory SQLite with the real migrations (`test/d1-shim.js`), so
they need Node 22 or later for `node:sqlite`.

## Not done yet

Creating the D1 database and deploying need the Cloudflare account, so
`database_id` and `BOT_USERNAME` are still `REPLACE_ME`, the webhook is not
registered with Telegram and there is no deploy workflow. The import of the
current YAML files and rate limiting of writes are separate steps.
