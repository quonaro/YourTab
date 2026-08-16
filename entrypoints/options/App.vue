<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useSettings } from "@/composables/useSettings";
import { useTheme } from "@/composables/useTheme";
import { useI18n, setLanguage } from "@/composables/useI18n";
import type { Language } from "@/lib/settings";

const { t } = useI18n();
const { settings, saveSettings } = useSettings();
const { applyTheme, applyAccent, themes, accents } = useTheme();

const apiDomain = ref("");
const theme = ref<"light" | "dark" | "system">("system");
const accent = ref<string>("indigo");
const language = ref<Language>("ru");
const saved = ref(false);

onMounted(async () => {
  apiDomain.value = settings.value.apiDomain;
  theme.value = settings.value.theme;
  accent.value = settings.value.accent;
  language.value = settings.value.language;
});

function handleSave() {
  settings.value.apiDomain = apiDomain.value;
  settings.value.theme = theme.value;
  settings.value.accent = accent.value as any;
  settings.value.language = language.value;
  saveSettings();
  applyTheme(theme.value);
  applyAccent(accent.value as any);
  setLanguage(language.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground p-8">
    <div class="mx-auto max-w-2xl space-y-6">
      <h1 class="text-2xl font-semibold">{{ t("options.title") }}</h1>

      <div class="card-base space-y-4">
        <div>
          <label class="form-label">{{ t("options.apiDomain") }}</label>
          <input
            v-model="apiDomain"
            type="text"
            class="input-base mt-1"
            :placeholder="t('options.apiDomainPlaceholder')"
          />
          <p class="form-hint mt-1">{{ t("options.apiDomainHint") }}</p>
        </div>

        <div>
          <label class="form-label">{{ t("options.theme") }}</label>
          <select v-model="theme" class="input-base mt-1">
            <option v-for="tm in themes" :key="tm" :value="tm">{{ tm }}</option>
          </select>
        </div>

        <div>
          <label class="form-label">{{ t("options.accentColor") }}</label>
          <div class="mt-2 flex gap-2">
            <button
              v-for="a in accents"
              :key="a.key"
              @click="accent = a.key"
              class="h-8 w-8 rounded-full border-2 transition"
              :class="
                accent === a.key ? 'border-foreground' : 'border-transparent'
              "
              :style="{ backgroundColor: `hsl(${a.value})` }"
            />
          </div>
        </div>

        <div>
          <label class="form-label">{{ t("options.language") }}</label>
          <select v-model="language" class="input-base mt-1">
            <option value="ru">{{ t("languages.ru") }}</option>
            <option value="en">{{ t("languages.en") }}</option>
          </select>
        </div>

        <div class="flex items-center gap-3">
          <button class="btn-primary" @click="handleSave">
            {{ t("options.save") }}
          </button>
          <span v-if="saved" class="text-sm text-muted-foreground">{{
            t("options.saved")
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
