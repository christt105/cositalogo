<script setup>
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AuditLog from "../components/AuditLog.vue";
import MembersPanel from "../components/MembersPanel.vue";
import ReviewPanel from "../components/ReviewPanel.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { titleNameFrom } from "../lib/audit.js";
import { withNext } from "../lib/route.js";

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const session = useSession();
const catalog = useCatalog();
const TABS = ["members", "review"];
const tab = computed(() => (TABS.includes(props.query.get("tab")) ? props.query.get("tab") : "activity"));
const title = computed(() => (/^(movie|series):\d{1,9}$/.test(props.query.get("title") ?? "") ? props.query.get("title") : ""));
const titleLabel = computed(() => {
  if (!title.value) return "";
  const [type, tmdb] = title.value.split(":");
  return titleNameFrom(catalog.byKey.value)({ type, tmdb: Number(tmdb) });
});
const loginHref = computed(() => withNext("/login", "/admin"));
</script>

<template>
  <section class="panel">
    <h1 class="panel__title">Admin</h1>
    <p v-if="session.status.value === 'loading'" class="empty">Comprobando la sesión…</p>
    <section v-else-if="!session.user.value" class="empty">
      <p>Inicia sesión con Telegram para entrar.</p>
      <RouterLink class="btn btn--primary" :to="loginHref">Iniciar sesión</RouterLink>
    </section>
    <p v-else-if="!session.user.value.admin" class="empty">Esta parte es solo para admins.</p>
    <template v-else>
      <nav class="poster-tabs" aria-label="Secciones">
        <RouterLink class="poster-tab" :class="{ 'is-active': tab === 'activity' }" to="/admin">Actividad</RouterLink>
        <RouterLink class="poster-tab" :class="{ 'is-active': tab === 'review' }" to="/admin?tab=review">Por comprobar</RouterLink>
        <RouterLink class="poster-tab" :class="{ 'is-active': tab === 'members' }" to="/admin?tab=members">Miembros</RouterLink>
      </nav>
      <template v-if="tab === 'activity'">
        <p v-if="title" class="panel__hint">
          Solo los cambios de <RouterLink :to="`/${title.replace(':', '/')}`">{{ titleLabel }}</RouterLink> · <RouterLink to="/admin">ver todos</RouterLink>
        </p>
        <AuditLog :title="title" />
      </template>
      <ReviewPanel v-else-if="tab === 'review'" />
      <MembersPanel v-else />
    </template>
  </section>
</template>
