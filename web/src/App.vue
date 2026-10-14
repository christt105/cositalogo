<script setup>
import { computed } from "vue";
import AppHeader from "./components/AppHeader.vue";
import { provideCatalog } from "./composables/useCatalog.js";
import { useHashRoute } from "./composables/useHashRoute.js";
import { provideSession } from "./composables/useSession.js";
import { provideSettings } from "./composables/useSettings.js";
import { matchRoute } from "./lib/route.js";
import { ROUTES } from "./routes.js";
import NotFoundView from "./views/NotFoundView.vue";

provideCatalog();
provideSession();
provideSettings();

const route = useHashRoute();
const matched = computed(() => matchRoute(ROUTES, route.value.parts));
const view = computed(() => matched.value?.route.view ?? NotFoundView);
const viewProps = computed(() => (matched.value ? { ...matched.value.route.props, ...matched.value.params, query: route.value.params } : {}));
const path = computed(() => `/${route.value.parts.join("/")}`);
const viewKey = computed(() => (matched.value ? path.value : "missing"));
</script>

<template>
  <AppHeader :path="path" />
  <main>
    <component :is="view" :key="viewKey" v-bind="viewProps" />
  </main>
  <footer class="footer">
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img class="footer__logo" src="/tmdb.svg" alt="TMDB"></a>
    <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </footer>
</template>
