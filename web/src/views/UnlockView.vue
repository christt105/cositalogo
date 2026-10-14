<script setup>
import { computed, ref } from "vue";
import { unlock } from "../api/session.js";
import { useSession } from "../composables/useSession.js";
import { errorMessage } from "../lib/errors.js";
import { nextPath, withNext } from "../lib/route.js";

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const session = useSession();
const password = ref("");
const busy = ref(false);
const error = ref("");
const loginHref = computed(() => withNext("/login", `/unlock?${props.query}`));

async function submit() {
  busy.value = true;
  error.value = "";
  try {
    session.setUser(await unlock(password.value));
    location.hash = `#${nextPath(props.query)}`;
  } catch (err) {
    if (err.status === 403) error.value = "Esa no es la contraseña.";
    else if (err.status === 429) error.value = "Demasiados intentos fallidos. Espera una hora y vuelve a probar.";
    else if (err.status === 401) {
      session.setUser(null);
      error.value = errorMessage(err);
    } else error.value = errorMessage(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="panel">
    <h1 class="panel__title">Desbloquear la escritura</h1>
    <p v-if="session.status.value === 'loading'">Comprobando la sesión…</p>
    <template v-else-if="!session.user.value">
      <p>Primero tienes que iniciar sesión.</p>
      <a class="btn btn--primary" :href="loginHref">Iniciar sesión</a>
    </template>
    <template v-else-if="session.user.value.member">
      <p>Ya puedes añadir y cambiar enlaces.</p>
      <a class="btn btn--primary" href="#/add">Añadir</a>
    </template>
    <form v-else class="form" @submit.prevent="submit">
      <p>Para añadir o cambiar enlaces hace falta la contraseña que se comparte en el grupo. Solo se pide una vez.</p>
      <label class="form__label" for="unlock-password">Contraseña</label>
      <input id="unlock-password" v-model="password" class="input" type="password" autocomplete="current-password" required>
      <p v-if="error" class="form__error" role="alert">{{ error }}</p>
      <button type="submit" class="btn btn--primary" :disabled="busy || !password">Desbloquear</button>
    </form>
  </section>
</template>
