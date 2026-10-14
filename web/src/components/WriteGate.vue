<script setup>
import { computed } from "vue";
import { useSession } from "../composables/useSession.js";
import { withNext } from "../lib/route.js";

const props = defineProps({ path: { type: String, required: true } });

const session = useSession();
const loginHref = computed(() => withNext("/login", props.path));
const unlockHref = computed(() => withNext("/unlock", props.path));
</script>

<template>
  <slot v-if="session.canWrite.value" />
  <p v-else-if="session.status.value === 'loading'" class="empty">Comprobando la sesión…</p>
  <section v-else-if="!session.user.value" class="empty">
    <p>Para añadir o cambiar enlaces tienes que iniciar sesión con Telegram.</p>
    <a class="btn btn--primary" :href="loginHref">Iniciar sesión</a>
  </section>
  <section v-else class="empty">
    <p>Antes de escribir, desbloquea la escritura con la contraseña del grupo.</p>
    <a class="btn btn--primary" :href="unlockHref">Desbloquear</a>
  </section>
</template>
