<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useSession } from "../composables/useSession.js";
import { withNext } from "../lib/route.js";

const props = defineProps({ path: { type: String, required: true } });

const session = useSession();
const user = session.user;
const loginHref = computed(() => withNext("/login", props.path));
const unlockHref = computed(() => withNext("/unlock", props.path));

async function signOut() {
  try {
    await session.signOut();
  } catch (err) {
    console.error("Could not sign out", err);
  }
}
</script>

<template>
  <header class="header">
    <RouterLink class="header__title" to="/">Cositálogo</RouterLink>
    <nav v-if="session.status.value === 'ready'" class="header__session" aria-label="Sesión">
      <template v-if="user">
        <RouterLink v-if="user.member" class="btn btn--primary" to="/add">Añadir</RouterLink>
        <RouterLink v-else class="btn" :to="unlockHref">Desbloquear</RouterLink>
        <RouterLink v-if="user.admin" class="btn btn--link" to="/admin">Admin</RouterLink>
        <span class="header__user">{{ user.name }}</span>
        <button type="button" class="btn btn--link" @click="signOut">Salir</button>
      </template>
      <RouterLink v-else class="btn" :to="loginHref">Iniciar sesión</RouterLink>
    </nav>
  </header>
</template>
