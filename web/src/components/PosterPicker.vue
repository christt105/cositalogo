<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { POSTER_PAGE } from "../lib/posters.js";
import { getTmdbPosters } from "../api/tmdb.js";

/**
 * Lets the user keep TMDB's default poster or pick another one of the
 * title's TMDB posters, grouped by language. `v-model` is the chosen URL, or
 * null for the default; it is kept on mount and reset when the title changes.
 * Shows nothing when TMDB has no other posters.
 */
const props = defineProps({
  type: { type: String, required: true },
  tmdb: { type: Number, required: true },
  defaultPoster: { type: String, default: null },
  originalLanguage: { type: String, default: null },
  loadPosters: { type: Function, default: getTmdbPosters },
});
const model = defineModel({ type: String, default: null });

const groups = shallowRef([]);
const active = ref("");
const shown = ref(POSTER_PAGE);

const current = computed(() => groups.value.find((g) => g.key === active.value) ?? null);
const rest = computed(() => (current.value ? current.value.posters.length - shown.value : 0));

watch(
  () => [props.type, props.tmdb],
  async ([type, tmdb], previous) => {
    groups.value = [];
    if (previous) model.value = null;
    try {
      const loaded = await props.loadPosters(type, tmdb, props.originalLanguage);
      if (type !== props.type || tmdb !== props.tmdb) return;
      groups.value = loaded;
      active.value = loaded[0]?.key ?? "";
      shown.value = POSTER_PAGE;
    } catch (err) {
      console.error("Could not load the posters from TMDB", err);
    }
  },
  { immediate: true }
);

function showGroup(key) {
  active.value = key;
  shown.value = POSTER_PAGE;
}
</script>

<template>
  <div v-if="groups.length" class="poster-picker">
    <div class="form__label">Portada</div>
    <div class="poster-default">
      <button type="button" class="poster" :class="{ 'is-active': model === null }" @click="model = null">
        <img v-if="defaultPoster" :src="defaultPoster" alt="" loading="lazy"><span>Por defecto</span>
      </button>
    </div>
    <div class="poster-tabs" role="tablist">
      <button
        v-for="g in groups"
        :key="g.key"
        type="button"
        class="poster-tab"
        :class="{ 'is-active': g.key === active }"
        role="tab"
        :aria-selected="String(g.key === active)"
        @click="showGroup(g.key)"
      >
        {{ g.label }} <span class="poster-tab__count">{{ g.posters.length }}</span>
      </button>
    </div>
    <div class="poster-grid" role="tabpanel">
      <button
        v-for="p in current.posters.slice(0, shown)"
        :key="p.value"
        type="button"
        class="poster"
        :class="{ 'is-active': model === p.value }"
        :aria-pressed="String(model === p.value)"
        @click="model = p.value"
      >
        <img :src="p.thumb" alt="" loading="lazy">
      </button>
    </div>
    <button v-if="rest > 0" type="button" class="btn poster-more" @click="shown += POSTER_PAGE">Ver más ({{ rest }})</button>
  </div>
</template>
