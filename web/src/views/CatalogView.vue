<script setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import TitleCard from "../components/TitleCard.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { FILTER_KEYS, SORT_OPTIONS, TYPE_LABELS, filterCatalog, filterOptions, searchCatalog, sortCatalog } from "../lib/catalog.js";
import { debounce } from "../lib/debounce.js";

const SEARCH_DEBOUNCE_MS = 150;

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const catalog = useCatalog();
const router = useRouter();
const status = catalog.status;
const input = ref(props.query.get("q") ?? "");
const query = ref(input.value);

const FILTER_LABELS = { type: "Tipo", quality: "Calidad", audio: "Audio", subs: "Subtítulos", genre: "Género" };

const filters = computed(() => Object.fromEntries(FILTER_KEYS.map((key) => [key, props.query.get(key) ?? ""])));
const options = computed(() => ({ type: ["movie", "series"], ...filterOptions(catalog.items.value) }));
const filtersActive = computed(() => FILTER_KEYS.some((key) => filters.value[key]));
const sort = computed(() => (SORT_OPTIONS.some((option) => option.value === props.query.get("sort")) ? props.query.get("sort") : ""));
const items = computed(() => sortCatalog(filterCatalog(searchCatalog(catalog.items.value, query.value), filters.value), sort.value));
const optionLabel = (key, value) => (key === "type" ? TYPE_LABELS[value] + "s" : value);

function updateQuery(changes) {
  const next = { q: query.value, ...filters.value, sort: sort.value, ...changes };
  router.replace({ query: Object.fromEntries(Object.entries(next).filter(([, v]) => v)) });
}

const commitSearch = debounce(() => {
  query.value = input.value.trim();
  updateQuery({ q: query.value });
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
  <div v-if="status === 'ready'" class="filters">
    <label v-for="key in FILTER_KEYS" :key="key" class="filters__field">
      <span class="filters__label">{{ FILTER_LABELS[key] }}</span>
      <select class="filters__select" :data-filter="key" :value="filters[key]" @change="updateQuery({ [key]: $event.target.value })">
        <option value="">Todos</option>
        <option v-for="value in options[key]" :key="value" :value="value">{{ optionLabel(key, value) }}</option>
      </select>
    </label>
    <label class="filters__field">
      <span class="filters__label">Ordenar por</span>
      <select class="filters__select" data-sort :value="sort" @change="updateQuery({ sort: $event.target.value })">
        <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
    </label>
    <button v-if="filtersActive" type="button" class="filters__clear" @click="updateQuery(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])))">
      Quitar filtros
    </button>
  </div>
  <p v-if="status === 'loading'" class="empty">Cargando el catálogo…</p>
  <p v-else-if="status === 'error'" class="empty">No se ha podido cargar el catálogo. Recarga la página para volver a intentarlo.</p>
  <p v-else-if="items.length === 0" class="empty">No hay nada que coincida{{ query ? ` con «${query}»` : "" }}{{ filtersActive ? " y los filtros elegidos" : "" }}.</p>
  <div v-else class="grid">
    <TitleCard v-for="item in items" :key="`${item.type}/${item.tmdb}`" :item="item" />
  </div>
</template>
