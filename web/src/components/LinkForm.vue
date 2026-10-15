<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { seasonOptions, validateLink } from "../../../site/forms.js";
import { useSettings } from "../composables/useSettings.js";
import { linkBody } from "../lib/links.js";

const props = defineProps({
  type: { type: String, required: true },
  seasons: { type: Array, default: () => [] },
  initial: { type: Object, default: null },
  submitLabel: { type: String, default: "Guardar" },
  busy: { type: Boolean, default: false },
  cancellable: { type: Boolean, default: false },
});
const emit = defineEmits(["submit", "cancel"]);

const settings = useSettings();
const ids = `link-${Math.random().toString(36).slice(2, 8)}`;

const options = computed(() => seasonOptions(props.seasons));
const knownSeason = (value) => options.value.some((o) => String(o.value) === value && o.value !== "other");
const firstSeason = props.seasons.filter((s) => s.season_number > 0).sort((a, b) => a.season_number - b.season_number)[0];
const initialSeason = props.initial?.season ?? (firstSeason ? String(firstSeason.season_number) : "all");

const fields = reactive({
  season: knownSeason(initialSeason) ? initialSeason : "other",
  otherSeason: knownSeason(initialSeason) ? "" : initialSeason,
  quality: props.initial?.quality ?? "",
  audio: [...(props.initial?.audio ?? [])],
  subs: [...(props.initial?.subs ?? [])],
  tags: props.initial?.tags ?? "",
  link: props.initial?.link ?? "",
});
const touched = ref(false);

const isSeries = computed(() => props.type === "series");
const seasonValue = computed(() => (fields.season === "other" ? fields.otherSeason.trim() : fields.season));
const seasonError = computed(() => (isSeries.value && !/^(\d+|all)$/.test(seasonValue.value) ? "Escribe el número de la temporada." : ""));
const linkError = computed(() => {
  const link = fields.link.trim();
  if (!link) return touched.value ? "Falta el enlace del mensaje de Telegram." : "";
  return settings.data.value ? validateLink(link, settings.data.value.groups) : "";
});
const valid = computed(() => settings.status.value === "ready" && fields.quality && fields.link.trim() && !linkError.value && !seasonError.value);

onMounted(async () => {
  const loaded = await settings.load();
  if (loaded && !fields.quality) fields.quality = loaded.qualities[0];
});

function submit() {
  touched.value = true;
  if (!valid.value) return;
  emit("submit", linkBody(props.type, { ...fields, season: seasonValue.value }));
}
</script>

<template>
  <p v-if="settings.status.value === 'error'" class="form__error" role="alert">
    No se han podido cargar las calidades e idiomas.
    <button type="button" class="btn btn--link" @click="settings.load()">Reintentar</button>
  </p>
  <p v-else-if="settings.status.value !== 'ready'" class="panel__hint">Cargando…</p>
  <form v-else class="form" @submit.prevent="submit">
    <label class="form__label" :for="`${ids}-link`">Enlace del mensaje de Telegram</label>
    <input
      :id="`${ids}-link`"
      v-model="fields.link"
      class="input"
      type="url"
      inputmode="url"
      placeholder="https://t.me/c/2229558644/12345"
      :aria-invalid="Boolean(linkError)"
      :aria-describedby="`${ids}-link-error`"
      @blur="touched = true"
    >
    <p :id="`${ids}-link-error`" class="form__error">{{ linkError }}</p>

    <div class="form__row">
      <div v-if="isSeries">
        <label class="form__label" :for="`${ids}-season`">Temporada</label>
        <select :id="`${ids}-season`" v-model="fields.season" class="input">
          <option v-for="o in options" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
        </select>
        <input
          v-if="fields.season === 'other'"
          v-model="fields.otherSeason"
          class="input"
          type="text"
          inputmode="numeric"
          aria-label="Número de temporada"
          placeholder="Número de temporada"
        >
        <p class="form__error">{{ seasonError }}</p>
      </div>
      <div>
        <label class="form__label" :for="`${ids}-quality`">Calidad</label>
        <select :id="`${ids}-quality`" v-model="fields.quality" class="input">
          <option v-for="q in settings.data.value.qualities" :key="q" :value="q">{{ q }}</option>
        </select>
      </div>
    </div>

    <fieldset class="form__checks">
      <legend class="form__label">Audio</legend>
      <label v-for="lang in settings.data.value.languages.audio" :key="lang" class="check">
        <input v-model="fields.audio" type="checkbox" :value="lang"> {{ lang }}
      </label>
    </fieldset>
    <fieldset class="form__checks">
      <legend class="form__label">Subtítulos</legend>
      <label v-for="lang in settings.data.value.languages.subs" :key="lang" class="check">
        <input v-model="fields.subs" type="checkbox" :value="lang"> {{ lang }}
      </label>
    </fieldset>

    <label class="form__label" :for="`${ids}-tags`">Etiquetas (opcional, separadas por comas)</label>
    <input :id="`${ids}-tags`" v-model="fields.tags" class="input" type="text" placeholder="HDR, REMUX">

    <div class="form__actions">
      <button type="submit" class="btn btn--primary" :disabled="busy || !valid">{{ submitLabel }}</button>
      <button v-if="cancellable" type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancelar</button>
    </div>
  </form>
</template>
