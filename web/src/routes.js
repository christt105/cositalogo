import AddView from "./views/AddView.vue";
import AdminView from "./views/AdminView.vue";
import CatalogView from "./views/CatalogView.vue";
import LoginView from "./views/LoginView.vue";
import TitleView from "./views/TitleView.vue";
import UnlockView from "./views/UnlockView.vue";

const TMDB_ID = /^\d{1,9}$/;

/**
 * Every screen of the app, one view per route. A view gets the route's own
 * `props`, the captured segments and `query`, the hash's query parameters;
 * a hash that matches nothing shows NotFoundView.
 */
export const ROUTES = [
  { path: "/", view: CatalogView },
  { path: "/movie/:id", view: TitleView, props: { type: "movie" }, match: { id: TMDB_ID } },
  { path: "/series/:id", view: TitleView, props: { type: "series" }, match: { id: TMDB_ID } },
  { path: "/add", view: AddView },
  { path: "/login", view: LoginView },
  { path: "/unlock", view: UnlockView },
  { path: "/admin", view: AdminView },
];
