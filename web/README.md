# Cositálogo web

Vue 3 single-page app built with Vite. It talks only to the API in
`tools/cositalogo-api/` (same origin) and to the TMDB proxy in
`tools/tmdb-proxy/`.

## Screens

Routes are real paths handled by [vue-router](https://router.vuejs.org/) in
history mode and are listed in `src/routes.js`:

| Route | Screen |
|---|---|
| `/` | Grid of posters with search by title (also English or original), TMDB id or IMDb id; the search is kept in `/?q=...`, the filters and the sort order (`sort`, omitted for the default newest first) in the same query |
| `/movie/:id`, `/series/:id` | Title page: poster, synopsis and its links. Members add another version, edit, delete or move links and change the poster |
| `/login` | Sign-in: opens the bot link in Telegram and waits for the answer; `?next=` is where it goes back to |
| `/unlock` | The shared write password that turns a signed-in user into a member; also takes `?next=` |
| `/add` | Add a link: TMDB search, poster picker for new titles, season, quality, languages, tags and the Telegram link |
| `/admin` | Admins only: activity log with undo (`?title=` for one title's history, `?tab=members` for members and admins) |

Any other route shows `NotFoundView`. Views get the route's captures and its
query as props (`query` is a `URLSearchParams`), so they can be tested
without a router; internal links are `RouterLink`s. Every write reloads the
catalog.

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
`run_worker_first = ["/api", "/api/*", "/assets/*"]` in its `wrangler.toml`
sends API requests to the Worker before looking at files, so a file can never
shadow an endpoint and an unknown API path is a JSON 404, never the app. The
Worker also serves the hashed files under `/assets/` through the `ASSETS`
binding with long-lived caching, and answers a missing one with an uncached
JSON 404: the single-page fallback would otherwise hand out `index.html` for
it, cached for a year under a script URL. Other paths
are served from the build without running the Worker, and
`not_found_handling = "single-page-application"` answers a navigation to any
path that is not a file (`/movie/550`, a reload, a shared link) with
`index.html`, so the router can take over. Vite's dev server does the same.

The web has to share the API's origin to sign in: the session cookie is
`SameSite=Lax` and the API sends no CORS headers. `public/_headers` adds
`X-Robots-Tag: noindex` to every file the Worker does not serve (the page
also has the `robots` meta); Vite's dev server does not apply it. There is no service worker.
