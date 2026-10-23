<script setup>
import { computed, ref, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import { getTmdbTitle } from "../api/tmdb.js";
import TmdbSearch from "./TmdbSearch.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { TYPE_LABELS, titleKey } from "../lib/catalog.js";

const MAX_NOTE_LENGTH = 200;

const props = defineProps({
  busy: { type: Boolean, default: false },
  loadTitle: { type: Function, default: getTmdbTitle },
});
const emit = defineEmits(["submit"]);

const catalog = useCatalog();
const selected = shallowRef(null);
const state = ref("idle");
const season = ref("");
const note = ref("");

const existing = computed(() => (selected.value ? catalog.byKey.value.get(titleKey(selected.value.type, selected.value.tmdb)) : null));
const seasons = computed(() => [...(selected.value?.seasons ?? [])].sort((a, b) => a.season_number - b.season_number));

async function select({ type, tmdb }) {
  selected.value = null;
  season.value = "";
  state.value = "loading";
  try {
    selected.value = await props.loadTitle(type, tmdb);
    state.value = "ready";
  } catch (err) {
    console.error("Could not load the title from TMDB", err);
    state.value = "error";
  }
}

function submit() {
  const { type, tmdb } = selected.value;
  const body = { type, tmdb };
  if (type === "series" && season.value !== "") body.season = Number(season.value);
  if (note.value.trim()) body.note = note.value.trim();
  emit("submit", body, () => {
    selected.value = null;
    note.value = "";
    state.value = "idle";
  });
}
</script>

<template>
  <TmdbSearch @select="select" />
  <p v-if="state === 'loading'" class="panel__hint">Cargando…</p>
  <p v-else-if="state === 'error'" class="form__error">No se ha encontrado ese título en TMDB.</p>
  <form v-else-if="selected" class="form request-form" @submit.prevent="submit">
    <div class="selected">
      <img v-if="selected.poster" class="selected__poster" :src="selected.poster" alt="">
      <div>
        <h2 class="selected__title">{{ selected.title }}</h2>
        <p class="panel__hint">{{ TYPE_LABELS[selected.type] }} {{ selected.year }}</p>
        <p v-if="existing" class="existing">
          Ya hay versiones en el Cositálogo (<RouterLink :to="`/${existing.type}/${existing.tmdb}`">ver página</RouterLink>). Pídela solo si buscas otra temporada o versión, y dilo en la nota.
        </p>
      </div>
    </div>
    <label v-if="selected.type === 'series'" class="form__label">
      Qué quieres
      <select v-model="season" class="search">
        <option value="">La serie entera</option>
        <option v-for="s in seasons" :key="s.season_number" :value="String(s.season_number)">{{ s.name }}</option>
      </select>
    </label>
    <label class="form__label">
      Nota (opcional)
      <input v-model="note" class="search" type="text" :maxlength="MAX_NOTE_LENGTH" placeholder="Por ejemplo: en VOSE, mejor en 4K">
    </label>
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="busy">Pedir</button>
    </div>
  </form>
</template>
