<script setup>
import { computed } from "vue";
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
    <a class="header__title" href="#/">Cositálogo</a>
    <nav v-if="session.status.value === 'ready'" class="header__session" aria-label="Sesión">
      <template v-if="user">
        <a v-if="user.member" class="btn btn--primary" href="#/add">Añadir</a>
        <a v-else class="btn" :href="unlockHref">Desbloquear</a>
        <a v-if="user.admin" class="btn btn--link" href="#/admin">Admin</a>
        <span class="header__user">{{ user.name }}</span>
        <button type="button" class="btn btn--link" @click="signOut">Salir</button>
      </template>
      <a v-else class="btn" :href="loginHref">Iniciar sesión</a>
    </nav>
  </header>
</template>
