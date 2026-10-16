<script setup>
import { computed, reactive, ref, shallowRef } from "vue";
import { seasonOptions } from "../lib/forms.js";
import { getTmdbTitle } from "../api/tmdb.js";
import { TYPE_LABELS } from "../lib/catalog.js";
import { seasonFromForm } from "../lib/links.js";
import TmdbSearch from "./TmdbSearch.vue";

/**
 * Picks the title (and, for a series, the season) a link should move to.
 * Emits `move` with `{ type, tmdb, season? }` as `POST /api/links/:id/move` takes it.
 */
const props = defineProps({
  link: { type: Object, required: true },
  from: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  loadTitle: { type: Function, default: getTmdbTitle },
  search: { type: Function, default: undefined },
});
const emit = defineEmits(["move", "cancel"]);

const target = shallowRef(null);
const state = ref("idle");
const fields = reactive({ season: "all", otherSeason: "" });

const options = computed(() => seasonOptions(target.value?.seasons ?? []));
const isSeries = computed(() => target.value?.type === "series");
const seasonValue = computed(() => (fields.season === "other" ? fields.otherSeason.trim() : fields.season));
const seasonError = computed(() => (isSeries.value && !/^(\d+|all)$/.test(seasonValue.value) ? "Escribe el número de la temporada." : ""));
const unchanged = computed(() =>
  target.value?.type === props.from.type &&
  target.value?.tmdb === props.from.tmdb &&
  (!isSeries.value || String(props.link.season) === seasonValue.value)
);

async function select({ type, tmdb }) {
  target.value = null;
  state.value = "loading";
  try {
    target.value = await props.loadTitle(type, tmdb);
    const known = (value) => options.value.some((o) => String(o.value) === value && o.value !== "other");
    const current = props.link.season === undefined ? "" : String(props.link.season);
    const first = target.value.seasons.filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number)[0];
    const initial = known(current) ? current : first ? String(first.season_number) : "all";
    fields.season = known(initial) ? initial : "all";
    fields.otherSeason = "";
    state.value = "ready";
  } catch (err) {
    console.error("Could not load the title from TMDB", err);
    state.value = "error";
  }
}

function submit() {
  if (!target.value || seasonError.value || unchanged.value) return;
  const { type, tmdb } = target.value;
  emit("move", { type, tmdb, ...(type === "series" ? { season: seasonFromForm(seasonValue.value) } : {}) });
}
</script>

<template>
  <form class="form move" @submit.prevent="submit">
    <TmdbSearch v-bind="search ? { search } : {}" @select="select" />
    <p v-if="state === 'loading'" class="panel__hint">Cargando…</p>
    <p v-else-if="state === 'error'" class="form__error">No se ha encontrado ese título en TMDB.</p>
    <template v-else-if="target">
      <div class="selected">
        <img v-if="target.poster" class="selected__poster" :src="target.poster" alt="">
        <div>
          <p class="selected__title">{{ target.title }}</p>
          <p class="panel__hint">{{ TYPE_LABELS[target.type] }} {{ target.year }}</p>
        </div>
      </div>
      <div v-if="isSeries">
        <label class="form__label" for="move-season">Temporada</label>
        <select id="move-season" v-model="fields.season" class="input">
          <option v-for="o in options" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
        </select>
        <input
          v-if="fields.season === 'other'"
          v-model="fields.otherSeason"
          class="input"
          type="text"
          inputmode="numeric"
          aria-label="Número de temporada"
          placeholder="Número de temporada"
        >
        <p class="form__error">{{ seasonError }}</p>
      </div>
      <p v-if="unchanged" class="panel__hint">El enlace ya está aquí.</p>
    </template>
    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="busy || !target || !!seasonError || unchanged">Mover aquí</button>
      <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancelar</button>
    </div>
  </form>
</template>
