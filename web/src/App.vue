<script setup>
import { RouterView, useRoute } from "vue-router";
import AppHeader from "./components/AppHeader.vue";
import { provideCatalog } from "./composables/useCatalog.js";
import { provideSession } from "./composables/useSession.js";
import { provideSettings } from "./composables/useSettings.js";

provideCatalog();
provideSession();
provideSettings();

const route = useRoute();
</script>

<template>
  <AppHeader :path="route.path" />
  <main>
    <RouterView v-slot="{ Component, route: shown }">
      <component :is="Component" :key="shown.path" />
    </RouterView>
  </main>
  <footer class="footer">
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img class="footer__logo" src="/tmdb.svg" alt="TMDB"></a>
    <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </footer>
</template>
