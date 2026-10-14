<script setup>
import { computed } from "vue";
import { provideCatalog } from "./composables/useCatalog.js";
import { useHashRoute } from "./composables/useHashRoute.js";
import { matchRoute } from "./lib/route.js";
import { ROUTES } from "./routes.js";
import NotFoundView from "./views/NotFoundView.vue";

provideCatalog();

const route = useHashRoute();
const matched = computed(() => matchRoute(ROUTES, route.value.parts));
const view = computed(() => matched.value?.route.view ?? NotFoundView);
const viewProps = computed(() => (matched.value ? { ...matched.value.params, query: route.value.params } : {}));
</script>

<template>
  <header class="header">
    <a class="header__title" href="#/">Cositálogo</a>
  </header>
  <main>
    <component :is="view" v-bind="viewProps" />
  </main>
  <footer class="footer">
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img class="footer__logo" src="/tmdb.svg" alt="TMDB"></a>
    <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </footer>
</template>
