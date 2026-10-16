<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { RouterLink } from "vue-router";
import { getAudit, undoAudit } from "../api/admin.js";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { UNDOABLE, entryDetail, entryTitle, entryVerb, titleNameFrom, when } from "../lib/audit.js";
import { errorMessage } from "../lib/errors.js";

/** The audit log, newest first, with "Deshacer" on the writes that can still be undone. `title` (`movie:603`) keeps one title. */
const props = defineProps({ title: { type: String, default: "" } });

const catalog = useCatalog();
const session = useSession();
const entries = shallowRef([]);
const more = ref(false);
const state = ref("loading");
const busy = ref(false);
const error = ref("");
const confirming = ref(null);

const titleName = computed(() => titleNameFrom(catalog.byKey.value));

async function load(append = false) {
  if (!append) state.value = "loading";
  try {
    const page = await getAudit({ title: props.title || undefined, before: append ? entries.value.at(-1)?.id : undefined });
    entries.value = append ? [...entries.value, ...page.entries] : page.entries;
    more.value = page.more;
    state.value = "ready";
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
    state.value = "error";
  }
}

watch(() => props.title, () => load(), { immediate: true });

async function undo(entry) {
  busy.value = true;
  error.value = "";
  try {
    await undoAudit(entry.id);
    confirming.value = null;
    await Promise.all([load(), catalog.reload()]);
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <p v-if="error" class="form__error" role="alert">{{ error }}</p>
  <p v-if="state === 'loading'" class="empty">Cargando…</p>
  <p v-else-if="state === 'ready' && entries.length === 0" class="empty">No hay cambios registrados.</p>
  <ul v-else-if="entries.length" class="audit">
    <li v-for="e in entries" :key="e.id" class="audit__entry" :class="{ 'is-undone': e.undoneBy }">
      <p class="audit__line">
        <strong>{{ e.user.name || `#${e.user.id}` }}</strong>
        {{ entryVerb(e) }}
        <RouterLink v-if="entryTitle(e)" :to="`/${entryTitle(e).type}/${entryTitle(e).tmdb}`">{{ titleName(entryTitle(e)) }}</RouterLink>
      </p>
      <p class="audit__detail">{{ entryDetail(e, titleName) }}</p>
      <p class="panel__hint">
        {{ when(e.at) }} · #{{ e.id }}
        <template v-if="e.reverts"> · deshace #{{ e.reverts }}</template>
        <template v-if="e.undoneBy"> · deshecho en #{{ e.undoneBy }}</template>
      </p>
      <div v-if="UNDOABLE.has(e.action) && !e.undoneBy" class="link__actions">
        <button v-if="confirming !== e.id" type="button" class="btn" :disabled="busy" @click="confirming = e.id">Deshacer</button>
        <template v-else>
          <button type="button" class="btn btn--danger" :disabled="busy" @click="undo(e)">Sí, deshacer</button>
          <button type="button" class="btn" :disabled="busy" @click="confirming = null">No</button>
        </template>
      </div>
    </li>
  </ul>
  <button v-if="more" type="button" class="btn poster-more" :disabled="state === 'loading'" @click="load(true)">Ver más</button>
</template>
