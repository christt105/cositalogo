<script setup>
import { computed, ref, shallowRef } from "vue";
import { addAdmin, getAdmins, getMembers, removeAdmin, revokeMember } from "../api/admin.js";
import { useSession } from "../composables/useSession.js";
import { when } from "../lib/audit.js";
import { errorMessage } from "../lib/errors.js";

/** Everyone who can write, with the admins first; promotes, demotes and revokes after a confirmation. */
const session = useSession();
const members = shallowRef([]);
const admins = shallowRef([]);
const state = ref("loading");
const busy = ref(false);
const error = ref("");
const confirming = ref("");

const people = computed(() => {
  const adminIds = new Set(admins.value.map((a) => a.id));
  const rows = members.value.map((m) => ({ ...m, admin: adminIds.has(m.id), member: true }));
  for (const a of admins.value) if (!rows.some((r) => r.id === a.id)) rows.push({ ...a, admin: true, member: false });
  return rows.sort((a, b) => Number(b.admin) - Number(a.admin) || a.since - b.since);
});

async function load() {
  try {
    [members.value, admins.value] = await Promise.all([getMembers(), getAdmins()]);
    state.value = "ready";
  } catch (err) {
    if (err.status === 401) session.setUser(null);
    error.value = errorMessage(err);
    state.value = "error";
  }
}
load();

async function act(action) {
  busy.value = true;
  error.value = "";
  try {
    await action();
    confirming.value = "";
    await load();
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
  <ul v-else-if="state === 'ready'" class="audit">
    <li v-for="p in people" :key="p.id" class="audit__entry">
      <p class="audit__line">
        <strong>{{ p.name || `#${p.id}` }}</strong>
        <span v-if="p.admin" class="badge">Admin</span>
        <span v-if="p.id === session.user.value?.id" class="panel__hint">(tú)</span>
      </p>
      <p class="panel__hint">Desde {{ when(p.since) }} · Telegram {{ p.id }}</p>
      <div v-if="p.id !== session.user.value?.id" class="link__actions">
        <template v-if="confirming === `${p.id}`">
          <button v-if="p.admin" type="button" class="btn btn--danger" :disabled="busy" @click="act(() => removeAdmin(p.id))">Sí, quitar admin</button>
          <button v-else type="button" class="btn btn--danger" :disabled="busy" @click="act(() => revokeMember(p.id))">Sí, quitar acceso</button>
          <button type="button" class="btn" :disabled="busy" @click="confirming = ''">No</button>
        </template>
        <template v-else>
          <button v-if="!p.admin && p.member" type="button" class="btn" :disabled="busy" @click="act(() => addAdmin(p.id))">Hacer admin</button>
          <button v-if="p.admin" type="button" class="btn" :disabled="busy" @click="confirming = `${p.id}`">Quitar admin</button>
          <button v-else type="button" class="btn" :disabled="busy" @click="confirming = `${p.id}`">Quitar acceso</button>
        </template>
      </div>
    </li>
  </ul>
</template>
