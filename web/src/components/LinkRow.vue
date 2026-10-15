<script setup>
import { ref } from "vue";
import LinkForm from "./LinkForm.vue";
import MoveForm from "./MoveForm.vue";
import { linkFields } from "../lib/links.js";

const props = defineProps({
  link: { type: Object, required: true },
  type: { type: String, required: true },
  seasons: { type: Array, default: () => [] },
  seasonsReady: { type: Boolean, default: true },
  canEdit: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  from: { type: Object, default: null },
  loadTitle: { type: Function, default: undefined },
});
const emit = defineEmits(["edit", "save", "delete", "move"]);

const editing = ref(false);
const moving = ref(false);
const confirming = ref(false);

function startEditing() {
  editing.value = true;
  moving.value = false;
  confirming.value = false;
  emit("edit");
}

function startMoving() {
  moving.value = true;
  confirming.value = false;
}

async function save(body) {
  emit("save", body, () => {
    editing.value = false;
  });
}
</script>

<template>
  <li class="link">
    <div class="link__info">
      <strong v-if="link.seasonName" class="link__season">{{ link.seasonName }}</strong>
      <span class="badge">{{ link.quality }}</span>
      <span v-for="a in link.audio" :key="`a-${a}`" class="chip">{{ a }}</span>
      <span v-for="s in link.subs" :key="`s-${s}`" class="chip chip--subs">subs {{ s }}</span>
      <span v-for="t in link.tags" :key="`t-${t}`" class="chip chip--tag">{{ t }}</span>
      <span v-if="link.group" class="panel__hint">{{ link.group }}</span>
    </div>
    <div class="link__actions">
      <a class="btn" :href="link.link" target="_blank" rel="noopener">Abrir</a>
      <template v-if="canEdit && link.id && !editing && !moving">
        <button type="button" class="btn" :disabled="busy" @click="startEditing">Editar</button>
        <template v-if="link.canDelete">
          <button v-if="from && !confirming" type="button" class="btn" :disabled="busy" @click="startMoving">Mover</button>
          <button v-if="!confirming" type="button" class="btn" :disabled="busy" @click="confirming = true">Borrar</button>
          <template v-else>
            <button type="button" class="btn btn--danger" :disabled="busy" @click="emit('delete')">Sí, borrar</button>
            <button type="button" class="btn" :disabled="busy" @click="confirming = false">No</button>
          </template>
        </template>
      </template>
    </div>
    <p v-if="editing && !seasonsReady" class="panel__hint">Cargando…</p>
    <LinkForm
      v-else-if="editing"
      :type="type"
      :seasons="seasons"
      :initial="linkFields(link)"
      :busy="busy"
      cancellable
      @submit="save"
      @cancel="editing = false"
    />
    <MoveForm
      v-else-if="moving"
      :link="link"
      :from="from"
      :busy="busy"
      v-bind="loadTitle ? { loadTitle } : {}"
      @move="(target) => emit('move', target, () => (moving = false))"
      @cancel="moving = false"
    />
  </li>
</template>
