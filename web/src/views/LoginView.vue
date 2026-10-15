<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { pollLogin, startLogin } from "../api/session.js";
import { useSession } from "../composables/useSession.js";
import { nextPath } from "../lib/route.js";

const POLL_MS = 2500;

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const session = useSession();
const state = ref("idle");
const link = ref(null);
const expiresAt = ref(0);
const now = ref(Date.now());
let pollTimer = null;
let clockTimer = null;

const secondsLeft = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)));
const countdown = computed(() => `${Math.floor(secondsLeft.value / 60)}:${String(secondsLeft.value % 60).padStart(2, "0")}`);

function stop() {
  clearTimeout(pollTimer);
  clearInterval(clockTimer);
  pollTimer = null;
  clockTimer = null;
}

async function start() {
  stop();
  state.value = "starting";
  try {
    const started = await startLogin();
    link.value = started.url;
    expiresAt.value = started.expiresAt;
    now.value = Date.now();
    state.value = "waiting";
    clockTimer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    pollTimer = setTimeout(poll, POLL_MS);
  } catch (err) {
    console.error("Could not start signing in", err);
    state.value = "error";
  }
}

async function poll() {
  try {
    const answer = await pollLogin();
    if (state.value !== "waiting") return;
    if (answer?.pending) {
      pollTimer = setTimeout(poll, POLL_MS);
      return;
    }
    stop();
    session.setUser(answer);
    state.value = "done";
    location.hash = `#${nextPath(props.query)}`;
  } catch (err) {
    if (state.value !== "waiting") return;
    stop();
    if (err.status === 410) {
      state.value = "expired";
      return;
    }
    console.error("Could not check the sign-in", err);
    state.value = "error";
  }
}

onBeforeUnmount(stop);
</script>

<template>
  <section class="panel">
    <h1 class="panel__title">Iniciar sesión</h1>
    <template v-if="session.user.value && state !== 'done'">
      <p>Ya has iniciado sesión como <strong>{{ session.user.value.name }}</strong>.</p>
      <a class="btn" href="#/">Volver al catálogo</a>
    </template>
    <template v-else-if="state === 'idle' || state === 'starting'">
      <p>Se inicia sesión con el bot de Telegram del Cositálogo: te da un enlace, lo abres, pulsas Iniciar y esta página se entera sola.</p>
      <button type="button" class="btn btn--primary" :disabled="state === 'starting'" @click="start">Iniciar sesión con Telegram</button>
    </template>
    <template v-else-if="state === 'waiting'">
      <p>Abre el bot y pulsa <strong>Iniciar</strong>. Puedes volver aquí cuando lo hayas hecho.</p>
      <a class="btn btn--primary" :href="link" target="_blank" rel="noopener">Abrir Telegram</a>
      <p class="panel__hint" aria-live="polite">Esperando a Telegram… El enlace caduca en {{ countdown }}.</p>
    </template>
    <template v-else-if="state === 'expired'">
      <p>El enlace ha caducado sin que se iniciara la sesión.</p>
      <button type="button" class="btn btn--primary" @click="start">Pedir otro enlace</button>
    </template>
    <template v-else-if="state === 'error'">
      <p>No se ha podido iniciar sesión. Vuelve a intentarlo.</p>
      <button type="button" class="btn btn--primary" @click="start">Reintentar</button>
    </template>
    <p v-else>Sesión iniciada.</p>
  </section>
</template>
