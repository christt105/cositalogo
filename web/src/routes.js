import CatalogView from "./views/CatalogView.vue";

/**
 * Every screen of the app, one view per route. A view gets the captured
 * segments as props plus `query`, the hash's query parameters; a hash that
 * matches nothing shows NotFoundView.
 */
export const ROUTES = [{ path: "/", view: CatalogView }];
