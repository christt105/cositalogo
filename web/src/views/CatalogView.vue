<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import TitleCard from "../components/TitleCard.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { searchCatalog } from "../lib/catalog.js";
import { debounce } from "../lib/debounce.js";

const SEARCH_DEBOUNCE_MS = 150;

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const catalog = useCatalog();
const router = useRouter();
const status = catalog.status;
const input = ref(props.query.get("q") ?? "");
const query = ref(input.value);

const items = computed(() => searchCatalog(catalog.items.value, query.value));

const commitSearch = debounce(() => {
  query.value = input.value.trim();
  router.replace({ query: query.value ? { q: query.value } : {} });
}, SEARCH_DEBOUNCE_MS);

watch(
  () => props.query.get("q") ?? "",
  (q) => {
    if (q === query.value) return;
    input.value = q;
    query.value = q;
  }
);
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
