<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useSession } from "../composables/useSession.js";
import { withNext } from "../lib/route.js";

const props = defineProps({
  path: { type: String, required: true },
  action: { type: String, default: "añadir o cambiar enlaces" },
});

const session = useSession();
const loginHref = computed(() => withNext("/login", props.path));
const unlockHref = computed(() => withNext("/unlock", props.path));
</script>

<template>
  <slot v-if="session.canWrite.value" />
  <p v-else-if="session.status.value === 'loading'" class="empty">Comprobando la sesión…</p>
  <section v-else-if="!session.user.value" class="empty">
    <p>Para {{ action }} tienes que iniciar sesión con Telegram.</p>
    <RouterLink class="btn btn--primary" :to="loginHref">Iniciar sesión</RouterLink>
  </section>
  <section v-else class="empty">
    <p>Antes de escribir, desbloquea la escritura con la contraseña del grupo.</p>
    <RouterLink class="btn btn--primary" :to="unlockHref">Desbloquear</RouterLink>
  </section>
</template>
