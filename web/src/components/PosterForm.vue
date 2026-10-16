<script setup>
import { computed, ref, shallowRef } from "vue";
import { getTmdbPosters, getTmdbTitle } from "../api/tmdb.js";
import PosterPicker from "./PosterPicker.vue";

/**
 * Changes the poster of a title already in the catalog. Starts on the
 * current choice and emits `save` with the new poster URL, or null for TMDB's
 * default, as `PUT /api/titles/:type/:id/poster` takes it.
 */
const props = defineProps({
  type: { type: String, required: true },
  tmdb: { type: Number, required: true },
  current: { type: String, default: null },
  busy: { type: Boolean, default: false },
  loadTitle: { type: Function, default: getTmdbTitle },
  loadPosters: { type: Function, default: getTmdbPosters },
});
const emit = defineEmits(["save", "cancel"]);

const title = shallowRef(null);
const state = ref("loading");
const initial = ref(null);
const choice = ref(null);

const unchanged = computed(() => choice.value === initial.value);

async function loadPosters(...args) {
  const groups = await props.loadPosters(...args);
  if (!groups.length) state.value = "empty";
  return groups;
}

async function load() {
  try {
    title.value = await props.loadTitle(props.type, props.tmdb);
    initial.value = props.current && props.current !== title.value.poster ? props.current : null;
    choice.value = initial.value;
    state.value = "ready";
  } catch (err) {
    console.error("Could not load the title from TMDB", err);
    state.value = "error";
  }
}

load();

function submit() {
  if (!unchanged.value) emit("save", choice.value);
}
</script>

<template>
  <form class="form poster-form" @submit.prevent="submit">
    <p v-if="state === 'loading'" class="panel__hint">Cargando…</p>
    <p v-else-if="state === 'error'" class="form__error">No se ha podido cargar este título de TMDB.</p>
    <p v-else-if="state === 'empty'" class="panel__hint">TMDB no tiene otras portadas de este título.</p>
    <PosterPicker
      v-if="title"
      v-model="choice"
      :type="type"
      :tmdb="tmdb"
      :default-poster="title.poster"
      :original-language="title.originalLanguage ?? null"
      :load-posters="loadPosters"
    />
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="busy || state !== 'ready' || unchanged">Guardar portada</button>
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancelar</button>
    </div>
  </form>
</template>
