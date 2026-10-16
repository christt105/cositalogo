# TMDB proxy

Cloudflare Worker (`cositeca-tmdb-proxy`) that lets the web search TMDB and
pick posters without holding a TMDB key. `worker.js` has no
dependencies. It exposes only a few read-only routes, always with
`language=es-ES`, and answers anything else with 404:

- `GET /search?q=<text>&type=movie|tv|multi&page=<1-99>`
- `GET /images?type=movie|tv&id=<tmdbId>` (posters)
- `GET /movie/<tmdbId>` and `GET /tv/<tmdbId>` (title info; series include
  the seasons list)
- `GET /find/<imdbId>` (resolve an IMDb id)

Only the origins in `ALLOWED_ORIGINS` (`worker.js`), the web's own, `http://localhost`,
`http://127.0.0.1` and `http://192.168.x.x` (local previews, any port) are
served: the `Origin` header (or, when it is absent, the origin of `Referer`)
must match one of them exactly, otherwise the Worker answers 403, so requests
without either header (curl, scripts) are rejected. Responses are cached at
the edge (1 h for searches, 1 day for the rest) and a `[[ratelimits]]`
binding caps each IP at 60 requests per minute so the Worker cannot be used
as a public TMDB mirror. If that binding is missing the Worker answers 503
instead of serving unlimited. If the key starts with `eyJ` it is sent as a
`Bearer` token, otherwise as `?api_key=`.

The web calls it through `proxyGet` in `web/src/api/tmdb.js`. Setting
`localStorage.tmdbProxy` in the browser (for example to
`http://localhost:8787` while running `wrangler dev`) points the web at
another proxy.

## Local development

Put `TMDB_API_KEY=...` in `tools/tmdb-proxy/.dev.vars` (gitignored) and run
`wrangler dev` from this folder; it listens on `localhost:8787`. The tests
are `test/worker.test.js` (`npm test`).

## Deploy

Every push to `main` that touches `tools/tmdb-proxy/**` runs
`.github/workflows/deploy-tmdb-proxy.yml` (tests, then `wrangler deploy`); it
can also be started by hand from the Actions tab. The TMDB key is a Worker
secret managed by hand and kept across deploys:

```sh
wrangler secret put TMDB_API_KEY
```
