<script setup>
import { ref } from "vue";
import { searchTitles } from "../api/tmdb.js";
import { useCatalog } from "../composables/useCatalog.js";
import { TYPE_LABELS, titleKey } from "../lib/catalog.js";
import { debounce } from "../lib/debounce.js";

const SEARCH_DEBOUNCE_MS = 300;

const props = defineProps({ initial: { type: String, default: "" }, search: { type: Function, default: searchTitles } });
const emit = defineEmits(["select"]);

const catalog = useCatalog();
const input = ref(props.initial);
const results = ref([]);
const state = ref("idle");
let seq = 0;

async function run() {
  const query = input.value.trim();
  const call = ++seq;
  if (!query) {
    results.value = [];
    state.value = "idle";
    return;
  }
  state.value = "searching";
  try {
    const found = await props.search(query);
    if (call !== seq) return;
    if (found.length === 1 && !found[0].title) {
      results.value = [];
      state.value = "idle";
      emit("select", found[0]);
      return;
    }
    results.value = found;
    state.value = "done";
  } catch (err) {
    if (call !== seq) return;
    console.error("TMDB search failed", err);
    state.value = "error";
  }
}

const onInput = debounce(run, SEARCH_DEBOUNCE_MS);
if (props.initial) run();

function pick(result) {
  results.value = [];
  state.value = "idle";
  emit("select", result);
}
</script>

<template>
  <label class="form__label" for="tmdb-search">Busca la película o serie, o pega una URL de TMDB o un id de IMDb</label>
  <input
    id="tmdb-search"
    v-model="input"
    class="search"
    type="search"
    placeholder="Título, URL de TMDB o tt1234567"
    autocomplete="off"
    @input="onInput"
  >
  <p v-if="state === 'searching'" class="panel__hint">Buscando…</p>
  <p v-else-if="state === 'error'" class="form__error">No se ha podido buscar en TMDB. Vuelve a intentarlo.</p>
  <p v-else-if="state === 'done' && results.length === 0" class="panel__hint">Sin resultados en TMDB.</p>
  <ul v-else-if="results.length" class="results">
    <li v-for="r in results" :key="titleKey(r.type, r.tmdb)">
      <button type="button" class="result" @click="pick(r)">
        <img v-if="r.poster" class="result__poster" :src="r.poster" alt="" loading="lazy">
        <span v-else class="result__poster" />
        <span class="result__info">
          <span class="result__title">{{ r.title }}</span>
          <span class="result__meta">
            {{ TYPE_LABELS[r.type] }} {{ r.year }}
            <span v-if="catalog.byKey.value.has(titleKey(r.type, r.tmdb))" class="chip">Ya en el Cositálogo</span>
          </span>
        </span>
      </button>
    </li>
  </ul>
</template>
