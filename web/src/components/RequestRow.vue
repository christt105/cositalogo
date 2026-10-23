<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { TYPE_LABELS } from "../lib/catalog.js";

defineProps({
  request: { type: Object, required: true },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(["vote", "unvote", "delete"]);

const confirming = ref(false);
const day = (ms) => new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
</script>

<template>
  <li class="request" :class="{ 'request--done': request.fulfilledAt }">
    <img v-if="request.poster" class="result__poster" :src="request.poster" alt="" loading="lazy">
    <span v-else class="result__poster" />
    <div class="request__info">
      <strong class="request__title">{{ request.title }}</strong>
      <span class="result__meta">
        {{ TYPE_LABELS[request.type] }} {{ request.year }}<template v-if="request.type === 'series'"> · {{ request.seasonName ?? "Serie entera" }}</template>
      </span>
      <span v-if="request.note" class="request__note">{{ request.note }}</span>
      <span class="panel__hint">
        Pedida por {{ request.requestedBy.name || "alguien" }} el {{ day(request.createdAt) }}
        · {{ request.votes === 1 ? "1 la quiere" : `${request.votes} la quieren` }}
      </span>
      <p v-if="request.fulfilledAt" class="request__done">
        Ya está desde el {{ day(request.fulfilledAt) }}: <RouterLink :to="`/${request.type}/${request.tmdb}`">ver página</RouterLink>
      </p>
      <div class="selected__actions">
        <template v-if="!request.fulfilledAt">
          <button v-if="request.voted" type="button" class="btn btn--link" :disabled="busy" @click="emit('unvote')">Ya no la quiero</button>
          <button v-else type="button" class="btn" :disabled="busy" @click="emit('vote')">Yo también</button>
        </template>
        <template v-if="request.canDelete">
          <button v-if="!confirming" type="button" class="btn btn--link" :disabled="busy" @click="confirming = true">Borrar</button>
          <template v-else>
            <button type="button" class="btn btn--danger" :disabled="busy" @click="emit('delete')">Borrar petición</button>
            <button type="button" class="btn btn--link" @click="confirming = false">Cancelar</button>
          </template>
        </template>
      </div>
    </div>
  </li>
</template>
