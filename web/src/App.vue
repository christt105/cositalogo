<script setup>
import { computed } from "vue";
import CatalogGrid from "./CatalogGrid.vue";
import { useHashRoute } from "./route.js";

const route = useHashRoute();
const view = computed(() => (route.value.parts.length === 0 ? "grid" : "missing"));
</script>

<template>
  <header class="header">
    <a class="header__title" href="#/">Cositálogo</a>
  </header>
  <main>
    <CatalogGrid v-if="view === 'grid'" :params="route.params" />
    <section v-else class="empty">
      <p>Aquí no hay nada.</p>
      <a class="btn" href="#/">Volver al catálogo</a>
    </section>
  </main>
  <footer class="footer">
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener"><img class="footer__logo" src="/tmdb.svg" alt="TMDB"></a>
    <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </footer>
</template>
