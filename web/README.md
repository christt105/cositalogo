# Cositálogo web

Vue 3 single-page app built with Vite. It talks only to the API in
`tools/cositalogo-api/` (same origin) and to the TMDB proxy in
`tools/tmdb-proxy/`.

## Screens

Routes live in the hash and are listed in `src/routes.js`:

| Route | Screen |
|---|---|
| `#/` | Grid of posters with search by title (also English or original), TMDB id or IMDb id; the search is kept in `#/?q=...` |
| `#/movie/:id`, `#/series/:id` | Title page: poster, synopsis and its links. Members add another version, edit, delete or move links and change the poster |
| `#/login` | Sign-in: opens the bot link in Telegram and waits for the answer |
| `#/unlock` | The shared write password that turns a signed-in user into a member |
| `#/add` | Add a link: TMDB search, poster picker for new titles, season, quality, languages, tags and the Telegram link |
| `#/admin` | Admins only: activity log with undo (`?title=` for one title's history), members and admins |

Any other route shows `NotFoundView`. Every write reloads the catalog.

## Code layout

- `src/api/`: `client.js` makes every API call (JSON bodies, errors as
  `ApiError` with the `status`), with one module per resource on top;
  `tmdb.js` talks to the TMDB proxy instead.
- `src/composables/`: shared reactive state, created once in `App.vue` and
  passed down with `provide`/`inject`: `useCatalog` (titles, an index by
  `type/tmdb`, loading status, `reload()`), `useSession` (who is signed in)
  and `useSettings` (qualities, groups and languages, loaded on first use).
- `src/views/`: one per route.
- `src/components/`: pieces of a screen (`LinkForm`, `LinkRow`, `MoveForm`,
  `PosterPicker`, `TmdbSearch`, `AuditLog`, `MembersPanel`, and `WriteGate`,
  which only shows its content to members).
- `src/lib/`: plain functions without Vue (form checks, poster grouping,
  audit labels, routing), each with its Vitest file next to it.

Search uses `matchesSearch` from `shared/rules.js`, the same code the API
uses.

## Commands

From the repository root:

```sh
npm run build:web    # writes tools/cositalogo-api/dist
npm run dev:web      # Vite dev server, proxies /api to wrangler dev on :8787
npm run test:web     # Vitest + happy-dom
```

`npm run dev:web` needs `wrangler dev` running in `tools/cositalogo-api/`
on its default port (see that README). Setting `localStorage.tmdbProxy` in
the browser points the web at another TMDB proxy, for example a local one.

## How it is served

The build goes to `tools/cositalogo-api/dist/` (gitignored), which the
`cositalogo` Worker uploads as its
[static assets](https://developers.cloudflare.com/workers/static-assets/).
`run_worker_first = ["/api/*"]` in its `wrangler.toml` sends API requests to
the Worker before looking at files, so a file can never shadow an endpoint;
other paths are served from the build without running the Worker.

The web has to share the API's origin to sign in: the session cookie is
`SameSite=Lax` and the API sends no CORS headers. `public/_headers` adds
`X-Robots-Tag: noindex` to every file (the page also has the `robots` meta)
and long-lived caching to the hashed files under `/assets/`; Vite's dev
server does not apply it. There is no service worker.
