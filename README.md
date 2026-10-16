# Cositálogo

An index of links to messages in private Telegram groups, enriched with
[TMDB](https://www.themoviedb.org/) metadata (titles, posters, synopses).
Live at https://cositalogo.christt105.workers.dev/. How to use it, in
Spanish: [`GUIA.md`](GUIA.md).

## Layout

| Path | What |
|---|---|
| `web/` | Vue 3 + Vite web app: grid, title pages, sign-in, add, edit, move, posters and the admin page |
| `tools/cositalogo-api/` | Cloudflare Worker `cositalogo`: the JSON API over a D1 database, serving the built web as static assets; also the D1 migrations, the nightly backup export/restore and the Worker that keeps the old `cositalogo-api` name redirecting. See its [README](tools/cositalogo-api/README.md) |
| `shared/rules.js` | Telegram link and search rules used by both the API and the web |
| `tools/tmdb-proxy/` | Cloudflare Worker `cositeca-tmdb-proxy`: read-only TMDB proxy for the web's searches and poster picker. See its [README](tools/tmdb-proxy/README.md) |
| `tools/telegram-bot/` | Cloudflare Worker `cositeca-telegram-bot`: the retired bot, which only answers with the link to the web |
| `site/` | The old GitHub Pages address (christt105.github.io/cositeca), now only a redirect to the web that keeps the `#/...` route |
| `test/` | Node tests for the Workers, the backup and the shared rules |

D1 is the only source of truth for the catalog. Every write goes through the
API and lands in an `audit` table with the value before and after, so an
admin can undo it from the web. A nightly workflow in the private
`christt105/cositalogo-backup` repository exports the whole database there as
JSON files (see [Backups](tools/cositalogo-api/README.md#backups)).

## Development

Node 22 or later (the tests use `node:sqlite`).

```sh
npm ci
npm test            # Node tests in test/ (Workers against an in-memory D1, backup, rules)
npm run test:web    # Vitest + happy-dom for web/
npm run build:web   # builds web/ into tools/cositalogo-api/dist
npm run dev:web     # Vite dev server, proxies /api to wrangler dev on :8787
```

Running the API locally with `wrangler dev`, a local D1 restored from a
backup, and the secrets each Worker needs are described in the READMEs of
`tools/cositalogo-api/` and `tools/tmdb-proxy/`. Nothing in the tests reaches
the network.

## CI and deploys

- `validate.yml`: `npm test`, `npm run test:web` and `npm run build:web` on
  every pull request and push to `main`.
- `deploy-cositalogo-api.yml`: on pushes to `main` that touch the API, its
  migrations, `web/`, `vite.config.js` or `shared/`; tests, builds the web,
  applies pending D1 migrations, deploys the `cositalogo` Worker and smoke
  tests it.
- `deploy-tmdb-proxy.yml` and `deploy-telegram-bot.yml`: deploy their Worker
  when its folder changes.
- `deploy.yml`: publishes `site/` (the redirect) to GitHub Pages when it
  changes.

The deploys use the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
repository secrets; each Worker's own secrets are set in Cloudflare with
`wrangler secret put` and survive deploys. Roll back with `git revert` of the
offending commit (which redeploys) or `wrangler rollback`.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. The
web shows the official TMDB logo (`web/public/tmdb.svg`, the "primary short,
blue" SVG from
[TMDB's logos and attribution page](https://www.themoviedb.org/about/logos-attribution)),
unmodified and linked to themoviedb.org, as their terms require.
