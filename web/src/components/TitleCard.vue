<script setup>
import { computed } from "vue";
import { TYPE_LABELS, seasonSummary } from "../lib/catalog.js";

const props = defineProps({ item: { type: Object, required: true } });

const typeLabel = computed(() => [TYPE_LABELS[props.item.type], seasonSummary(props.item)].filter(Boolean).join(" · "));
</script>

<template>
  <a class="card" :href="`#/${item.type}/${item.tmdb}`">
    <div class="card__poster-wrap">
      <img v-if="item.poster" class="card__poster" :src="item.poster" alt="" loading="lazy">
      <span class="card__type">{{ typeLabel }}</span>
      <div class="card__badges">
        <span v-for="q in item.qualities" :key="q" class="badge">{{ q }}</span>
      </div>
    </div>
    <h2 class="card__title">{{ item.title }}</h2>
    <div class="card__year">{{ item.year }}</div>
  </a>
</template>
