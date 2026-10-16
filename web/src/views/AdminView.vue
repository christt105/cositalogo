<script setup>
import { computed } from "vue";
import AuditLog from "../components/AuditLog.vue";
import MembersPanel from "../components/MembersPanel.vue";
import { useCatalog } from "../composables/useCatalog.js";
import { useSession } from "../composables/useSession.js";
import { titleNameFrom } from "../lib/audit.js";
import { withNext } from "../lib/route.js";

const props = defineProps({ query: { type: URLSearchParams, required: true } });

const session = useSession();
const catalog = useCatalog();
const tab = computed(() => (props.query.get("tab") === "members" ? "members" : "activity"));
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
      <a class="btn btn--primary" :href="loginHref">Iniciar sesión</a>
    </section>
    <p v-else-if="!session.user.value.admin" class="empty">Esta parte es solo para admins.</p>
    <template v-else>
      <nav class="poster-tabs" aria-label="Secciones">
        <a class="poster-tab" :class="{ 'is-active': tab === 'activity' }" href="#/admin">Actividad</a>
        <a class="poster-tab" :class="{ 'is-active': tab === 'members' }" href="#/admin?tab=members">Miembros</a>
      </nav>
      <template v-if="tab === 'activity'">
        <p v-if="title" class="panel__hint">
          Solo los cambios de <a :href="`#/${title.replace(':', '/')}`">{{ titleLabel }}</a> · <a href="#/admin">ver todos</a>
        </p>
        <AuditLog :title="title" />
      </template>
      <MembersPanel v-else />
    </template>
  </section>
</template>
