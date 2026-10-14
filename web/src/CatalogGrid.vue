<script setup>
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import TitleCard from "./TitleCard.vue";
import { debounce, fetchCatalog, searchCatalog } from "./catalog.js";
import { gridHash } from "./route.js";

const SEARCH_DEBOUNCE_MS = 150;

const props = defineProps({ params: { type: URLSearchParams, required: true } });

const catalog = shallowRef([]);
const status = ref("loading");
const input = ref(props.params.get("q") ?? "");
const query = ref(input.value);

const items = computed(() => searchCatalog(catalog.value, query.value));

const commitSearch = debounce(() => {
  query.value = input.value.trim();
  history.replaceState(null, "", gridHash(query.value));
}, SEARCH_DEBOUNCE_MS);

watch(
  () => props.params.get("q") ?? "",
  (q) => {
    input.value = q;
    query.value = q;
  }
);

onMounted(async () => {
  try {
    catalog.value = await fetchCatalog();
    status.value = "ready";
  } catch (err) {
    console.error("Could not load the catalog", err);
    status.value = "error";
  }
});
</script>

<template>
  <div class="toolbar">
    <input
      v-model="input"
      class="search"
      type="search"
      placeholder="Busca por título, id de TMDB o IMDB"
      aria-label="Buscar"
      @input="commitSearch"
    >
    <span v-if="status === 'ready'" class="toolbar__count">{{ items.length }} títulos</span>
  </div>
  <p v-if="status === 'loading'" class="empty">Cargando el catálogo…</p>
  <p v-else-if="status === 'error'" class="empty">No se ha podido cargar el catálogo. Recarga la página para volver a intentarlo.</p>
  <p v-else-if="items.length === 0" class="empty">No hay nada que coincida con «{{ query }}».</p>
  <div v-else class="grid">
    <TitleCard v-for="item in items" :key="`${item.type}/${item.tmdb}`" :item="item" />
  </div>
</template>
