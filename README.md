# Cositálogo

A website that links movies and series to Telegram messages
(`https://t.me/c/...` links). Each title shows its poster, synopsis and
other data from [TMDB](https://www.themoviedb.org/), and one link per
version: quality, audio and subtitle languages, season and tags. Anyone with
the address can browse and search. To add, edit or move links you sign in
through a Telegram bot and enter a shared password; every change is logged
and an admin can undo it.

## Layout

| Path | What |
|---|---|
| `web/` | The Vue 3 + Vite web app. See its [README](web/README.md) |
| `tools/cositalogo-api/` | Cloudflare Worker `cositalogo`: the JSON API over a D1 (SQLite) database, which also serves the built web. Migrations and the backup scripts live here too. See its [README](tools/cositalogo-api/README.md) |
| `tools/tmdb-proxy/` | Cloudflare Worker that forwards the web's TMDB searches, so the TMDB key never reaches the browser. See its [README](tools/tmdb-proxy/README.md) |
| `shared/rules.js` | Telegram link and search rules used by both the API and the web |
| `test/` | Node tests for the Workers and the backup scripts (the web's tests sit next to its files) |

## Development

Node 22 or later (the tests use `node:sqlite`).

```sh
npm ci
npm test            # Node tests in test/
npm run test:web    # Vitest for web/
npm run build:web   # builds web/ into tools/cositalogo-api/dist
npm run dev:web     # Vite dev server, proxies /api to wrangler dev on :8787
```

Running the API locally (`wrangler dev`, a local D1 restored from a backup,
the secrets it needs) is described in
[`tools/cositalogo-api/README.md`](tools/cositalogo-api/README.md#local-development).
Nothing in the tests reaches the network.

## CI and deploys

- `ci.yml` runs both test suites and the web build on every pull request and
  push to `main`.
- `deploy-cositalogo-api.yml` and `deploy-tmdb-proxy.yml` deploy their
  Worker on pushes to `main` that touch it. Worker secrets live in
  Cloudflare and survive deploys.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. The
web shows the official TMDB logo (`web/public/tmdb.svg`, the "primary short,
blue" SVG from
[TMDB's logos and attribution page](https://www.themoviedb.org/about/logos-attribution)),
unmodified and linked to themoviedb.org, as their terms require.
