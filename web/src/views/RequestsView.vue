<script setup>
import { computed, ref, shallowRef, watch } from "vue";
import { addRequest, deleteRequest, listRequests, unvoteRequest, voteRequest } from "../api/requests.js";
import RequestForm from "../components/RequestForm.vue";
import RequestRow from "../components/RequestRow.vue";
import WriteGate from "../components/WriteGate.vue";
import { useSession } from "../composables/useSession.js";
import { errorMessage } from "../lib/errors.js";

defineProps({
  loadTitle: { type: Function, default: undefined },
});

const session = useSession();
const requests = shallowRef([]);
const state = ref("idle");
const busy = ref(false);
const error = ref("");
const notice = ref("");

const open = computed(() => requests.value.filter((r) => !r.fulfilledAt));
const done = computed(() => requests.value.filter((r) => r.fulfilledAt));

function fail(err) {
  if (err.status === 401) session.setUser(null);
  error.value = errorMessage(err);
}

async function load() {
  state.value = "loading";
  try {
    requests.value = await listRequests();
    state.value = "ready";
  } catch (err) {
    fail(err);
    state.value = "error";
  }
}

watch(() => session.canWrite.value, (canWrite) => canWrite && load(), { immediate: true });

async function run(action) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await action();
    await load();
  } catch (err) {
    fail(err);
  } finally {
    busy.value = false;
  }
}

function submit(body, done) {
  run(async () => {
    const created = await addRequest(body);
    notice.value = created.votes > 1 ? "Ya la había pedido alguien: te hemos sumado a esa petición." : "Petición enviada.";
    done();
  });
}
</script>

<template>
  <section class="panel">
    <h1 class="panel__title">Peticiones</h1>
    <WriteGate path="/requests" action="pedir películas o temporadas">
      <p class="panel__hint">Pide una película, una serie o una temporada que no esté. Si alguien ya la pidió, pulsa «Yo también». Cuando se añade al Cositálogo, la petición sale como cumplida.</p>
      <RequestForm :busy="busy" v-bind="loadTitle ? { loadTitle } : {}" @submit="submit" />
      <p v-if="notice" class="panel__hint" role="status">{{ notice }}</p>
      <p v-if="error" class="form__error" role="alert">{{ error }}</p>
      <p v-if="state === 'loading' && !requests.length" class="panel__hint">Cargando…</p>
      <template v-else-if="state !== 'error' || requests.length">
        <h2 class="requests__heading">Pendientes</h2>
        <p v-if="!open.length" class="panel__hint">No hay nada pendiente.</p>
        <ul v-else class="results requests">
          <RequestRow
            v-for="r in open"
            :key="r.id"
            :request="r"
            :busy="busy"
            @vote="run(() => voteRequest(r.id))"
            @unvote="run(() => unvoteRequest(r.id))"
            @delete="run(() => deleteRequest(r.id))"
          />
        </ul>
        <template v-if="done.length">
          <h2 class="requests__heading">Cumplidas</h2>
          <ul class="results requests">
            <RequestRow v-for="r in done" :key="r.id" :request="r" :busy="busy" @delete="run(() => deleteRequest(r.id))" />
          </ul>
        </template>
      </template>
    </WriteGate>
  </section>
</template>
