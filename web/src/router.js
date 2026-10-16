import { createRouter } from "vue-router";
import { ROUTES } from "./routes.js";

/**
 * The app's router on `history`: a new page starts at the top, and going
 * back or forward returns to where the page was left.
 */
export function createAppRouter(history) {
  return createRouter({
    history,
    routes: ROUTES,
    scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? false : { top: 0 }),
  });
}
