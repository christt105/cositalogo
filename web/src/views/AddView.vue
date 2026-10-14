<script setup>
import { computed, ref, shallowRef } from "vue";
import { addLink } from "../api/links.js";
import { getTmdbTitle } from "../api/tmdb.js";
import LinkForm from "../components/LinkForm.vue";
import TmdbSearch from "../components/TmdbSearch.vue";
import WriteGate from "../components/WriteGate.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { TYPE_LABELS, titleKey } from "../lib/catalog.js";
import { errorMessage } from "../lib/errors.js";

const props = defineProps({
  query: { type: URLSearchParams, required: true },
  loadTitle: { type: Function, default: getTmdbTitle },
});

const catalog = useCatalog();
const session = useSession();
const selected = shallowRef(null);
const state = ref("idle");
const busy = ref(false);
const error = ref("");

const existing = computed(() => (selected.value ? catalog.byKey.value.get(titleKey(selected.value.type, selected.value.tmdb)) : null));

async function select({ type, tmdb }) {
  selected.value = null;
  error.value = "";
  state.value = "loading";
  try {
    selected.value = await props.loadTitle(type, tmdb);
    state.value = "ready";
  } catch (err) {
    console.error("Could not load the title from TMDB", err);
    state.value = "error";
  }
}

const preset = { type: props.query.get("type"), tmdb: Number(props.query.get("tmdb")) };
if ((preset.type === "movie" || preset.type === "series") && Number.isSafeInteger(preset.tmdb) && preset.tmdb > 0) select(preset);

async function submit(body) {
  busy.value = true;
  error.value = "";
  const { type, tmdb } = selected.value;
  try {
    await addLink({ type, tmdb, ...body });
    await catalog.reload();
    location.hash = `#/${type}/${tmdb}`;
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <h1 class="panel__title">Añadir un enlace</h1>
    <WriteGate path="/add">
      <TmdbSearch :initial="query.get('q') ?? ''" @select="select" />
      <p v-if="state === 'loading'" class="panel__hint">Cargando…</p>
      <p v-else-if="state === 'error'" class="form__error">No se ha encontrado ese título en TMDB.</p>
      <template v-else-if="selected">
        <div class="selected">
          <img v-if="selected.poster" class="selected__poster" :src="selected.poster" alt="">
          <div>
            <h2 class="selected__title">{{ selected.title }}</h2>
            <p class="panel__hint">{{ TYPE_LABELS[selected.type] }} {{ selected.year }}</p>
            <div v-if="existing" class="existing">
              <p>Ya está en el Cositálogo (<a :href="`#/${existing.type}/${existing.tmdb}`">ver página</a>). Versiones que ya tiene, para no repetir:</p>
              <ul>
                <li v-for="(l, i) in existing.links" :key="i">
                  <strong v-if="l.seasonName">{{ l.seasonName }}</strong>
                  <span class="badge">{{ l.quality }}</span>
                  {{ [...l.audio, ...l.subs.map((s) => `subs ${s}`)].join(", ") }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <LinkForm :key="titleKey(selected.type, selected.tmdb)" :type="selected.type" :seasons="selected.seasons" submit-label="Añadir" :busy="busy" @submit="submit" />
        <p v-if="error" class="form__error" role="alert">{{ error }}</p>
      </template>
    </WriteGate>
  </section>
</template>
