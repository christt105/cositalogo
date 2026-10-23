import AddView from "./views/AddView.vue";
import AdminView from "./views/AdminView.vue";
import CatalogView from "./views/CatalogView.vue";
import LoginView from "./views/LoginView.vue";
import NotFoundView from "./views/NotFoundView.vue";
import RequestsView from "./views/RequestsView.vue";
import TitleView from "./views/TitleView.vue";
import UnlockView from "./views/UnlockView.vue";
import { queryParams } from "./lib/route.js";

const withQuery = (route) => ({ query: queryParams(route.query) });
const title = (type) => (route) => ({ type, id: route.params.id });

/**
 * Every screen of the app, one view per route. A view gets the route's
 * captures as props and `query`, the URL's query parameters; a path that
 * matches nothing shows NotFoundView.
 */
export const ROUTES = [
  { path: "/", component: CatalogView, props: withQuery },
  { path: "/movie/:id(\\d{1,9})", component: TitleView, props: title("movie") },
  { path: "/series/:id(\\d{1,9})", component: TitleView, props: title("series") },
  { path: "/add", component: AddView, props: withQuery },
  { path: "/login", component: LoginView, props: withQuery },
  { path: "/unlock", component: UnlockView, props: withQuery },
  { path: "/admin", component: AdminView, props: withQuery },
  { path: "/requests", component: RequestsView },
  { path: "/:missing(.*)*", component: NotFoundView },
];
