<script setup>
import { computed, ref, shallowRef } from "vue";
import { RouterLink } from "vue-router";
import { getReview, verifyLinks } from "../api/links.js";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { titleKey } from "../lib/catalog.js";
import { errorMessage } from "../lib/errors.js";

/** The links the scan matched by itself, doubtful first, to check one by one or several at once. */
const BATCH = 50;

const catalog = useCatalog();
const session = useSession();
const items = shallowRef([]);
const state = ref("loading");
const busy = ref(false);
const error = ref("");
const onlyDoubtful = ref(false);
const chosen = ref(new Set());

const shown = computed(() => (onlyDoubtful.value ? items.value.filter((i) => i.doubtful) : items.value));
const doubtfulCount = computed(() => items.value.filter((i) => i.doubtful).length);
const allChosen = computed(() => shown.value.length > 0 && shown.value.every((i) => chosen.value.has(i.id)));

function titleOf(item) {
  const entry = catalog.byKey.value.get(titleKey(item.type, item.tmdb));
  return entry ? `${entry.title}${entry.year ? ` (${entry.year})` : ""}` : `${item.type}:${item.tmdb}`;
}

const posted = (ms) => new Date(ms).toLocaleDateString("es-ES");

async function load() {
  try {
    items.value = await getReview();
    chosen.value = new Set([...chosen.value].filter((id) => items.value.some((i) => i.id === id)));
    state.value = "ready";
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
    state.value = "error";
  }
}

load();

function toggle(id) {
  const next = new Set(chosen.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  chosen.value = next;
}

function toggleAll() {
  chosen.value = allChosen.value ? new Set() : new Set(shown.value.map((i) => i.id));
}

async function verify(ids) {
  busy.value = true;
  error.value = "";
  try {
    for (let i = 0; i < ids.length; i += BATCH) await verifyLinks(ids.slice(i, i + BATCH));
    chosen.value = new Set();
    await Promise.all([load(), catalog.reload()]);
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
    await load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <p v-if="error" class="form__error" role="alert">{{ error }}</p>
  <p v-if="state === 'loading'" class="empty">Cargando…</p>
  <p v-else-if="state === 'ready' && items.length === 0" class="empty">No queda nada por comprobar.</p>
  <template v-else-if="items.length">
    <p class="panel__hint">
      {{ items.length }} enlaces que casó el escaneo del canal, {{ doubtfulCount }} dudosos. Comprueba que el título es el del mensaje y márcalos;
      si no lo es, ábrelo y muévelo al bueno.
    </p>
    <div class="review__bar">
      <label class="check"><input type="checkbox" :checked="allChosen" @change="toggleAll"> Todos</label>
      <label class="check"><input v-model="onlyDoubtful" type="checkbox"> Solo dudosos</label>
      <button type="button" class="btn btn--primary" :disabled="busy || chosen.size === 0" @click="verify([...chosen])">
        Están bien ({{ chosen.size }})
      </button>
    </div>
    <ul class="audit">
      <li v-for="item in shown" :key="item.id" class="audit__entry review__item">
        <label class="check">
          <input type="checkbox" :checked="chosen.has(item.id)" :aria-label="`Elegir ${titleOf(item)}`" @change="toggle(item.id)">
        </label>
        <div class="review__info">
          <p class="audit__line">
            <RouterLink :to="`/${item.type}/${item.tmdb}`">{{ titleOf(item) }}</RouterLink>
            <span v-if="item.season !== undefined" class="panel__hint"> · {{ item.season === "all" ? "Serie completa" : `Temporada ${item.season}` }}</span>
            <span class="badge">{{ item.quality }}</span>
            <span v-if="item.doubtful" class="chip chip--review chip--doubtful">dudoso</span>
          </p>
          <p class="audit__detail panel__hint">
            Publicado el {{ posted(item.postedAt) }} · <a :href="item.link" target="_blank" rel="noopener">mensaje</a>
          </p>
        </div>
        <button type="button" class="btn" :disabled="busy" @click="verify([item.id])">Está bien</button>
      </li>
    </ul>
  </template>
</template>
