<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { getTitle } from "../api/catalog.js";
import { deleteLink, getTitleLinks, updateLink } from "../api/links.js";
import { getTmdbTitle } from "../api/tmdb.js";
import LinkRow from "../components/LinkRow.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { TYPE_LABELS } from "../lib/catalog.js";
import { errorMessage } from "../lib/errors.js";

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
  loadTmdb: { type: Function, default: getTmdbTitle },
});

const catalog = useCatalog();
const session = useSession();
const entry = shallowRef(null);
const owned = shallowRef([]);
const seasons = shallowRef([]);
const state = ref("loading");
const busy = ref(false);
const error = ref("");
const seasonsReady = ref(props.type !== "series");
let seasonsLoaded = false;

/** Catalog links with the id and `canDelete` the signed-in user sees, matched by position and URL. */
const links = computed(() =>
  (entry.value?.links ?? []).map((link, i) => {
    const mine = owned.value[i];
    return mine && mine.link === link.link ? { ...link, id: mine.id, canDelete: mine.canDelete } : link;
  })
);

async function loadLinks() {
  if (!session.user.value || state.value !== "ready") {
    owned.value = [];
    return;
  }
  try {
    owned.value = await getTitleLinks(props.type, props.id);
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    else console.error("Could not load the link ids", err);
    owned.value = [];
  }
}

async function load() {
  try {
    entry.value = (await getTitle(props.type, props.id)).entry;
    state.value = "ready";
  } catch (err) {
    entry.value = null;
    state.value = err.status === 404 ? "missing" : "error";
    if (err.status !== 404) console.error("Could not load the title", err);
  }
  await loadLinks();
}

watch(() => [props.type, props.id], load, { immediate: true });
watch(() => session.user.value?.id, loadLinks);

async function loadSeasons() {
  if (props.type !== "series" || seasonsLoaded) return;
  seasonsLoaded = true;
  try {
    seasons.value = (await props.loadTmdb(props.type, Number(props.id))).seasons;
  } catch (err) {
    console.error("Could not load the seasons from TMDB", err);
  }
  seasonsReady.value = true;
}

async function write(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    await Promise.all([load(), catalog.reload()]);
    return true;
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
    return false;
  } finally {
    busy.value = false;
  }
}

async function save(link, body, done) {
  if (await write(() => updateLink(link.id, body))) done();
}

function remove(link) {
  write(() => deleteLink(link.id));
}
</script>

<template>
  <section class="panel">
    <a class="back" href="#/">&larr; Volver al catálogo</a>
    <p v-if="state === 'loading'" class="empty">Cargando…</p>
    <p v-else-if="state === 'missing'" class="empty">Este título no está en el Cositálogo.</p>
    <p v-else-if="state === 'error'" class="empty">No se ha podido cargar. Recarga la página para volver a intentarlo.</p>
    <template v-else>
      <div class="selected">
        <img v-if="entry.poster" class="selected__poster" :src="entry.poster" alt="">
        <div>
          <h1 class="selected__title">{{ entry.title }}</h1>
          <p class="panel__hint">
            {{ TYPE_LABELS[entry.type] }} {{ entry.year }}
            <template v-if="entry.originalTitle && entry.originalTitle !== entry.title"> · {{ entry.originalTitle }}</template>
          </p>
          <a v-if="session.canWrite.value" class="btn btn--primary" :href="`#/add?type=${entry.type}&tmdb=${entry.tmdb}`">Añadir otra versión</a>
        </div>
      </div>
      <p v-if="error" class="form__error" role="alert">{{ error }}</p>
      <ul class="links">
        <LinkRow
          v-for="(link, i) in links"
          :key="link.id ?? `${i}-${link.link}`"
          :link="link"
          :type="entry.type"
          :seasons="seasons"
          :seasons-ready="seasonsReady"
          :can-edit="session.canWrite.value"
          :busy="busy"
          @edit="loadSeasons"
          @save="(body, done) => save(link, body, done)"
          @delete="remove(link)"
        />
      </ul>
    </template>
  </section>
</template>
