<script setup lang="ts">
import { ref, onMounted } from "vue";
import { IconDownload, IconUpload, IconLoader2 } from "@tabler/icons-vue";
import { useSettings } from "@/composables/useSettings";
import { useTheme } from "@/composables/useTheme";
import { useI18n, setLanguage } from "@/composables/useI18n";
import { ensureHostPermission } from "@/lib/config";
import type { Language } from "@/lib/settings";
import {
  exportAllData,
  importAllData,
  downloadExportData,
  type ExportData,
} from "@/lib/localDb";

const { t } = useI18n();
const { settings, saveSettings } = useSettings();
const { applyTheme, applyAccent, themes, accents } = useTheme();

const apiDomain = ref("");
const theme = ref<"light" | "dark" | "system">("system");
const accent = ref<string>("indigo");
const language = ref<Language>("ru");
const uiScale = ref(75);
const animationsEnabled = ref(true);
const saved = ref(false);
const permError = ref("");

onMounted(async () => {
  apiDomain.value = settings.value.apiDomain;
  theme.value = settings.value.theme;
  accent.value = settings.value.accent;
  language.value = settings.value.language;
  uiScale.value = settings.value.uiScale;
  animationsEnabled.value = settings.value.animationsEnabled;
});

async function handleSave() {
  permError.value = "";
  const domain = apiDomain.value.trim().replace(/\/+$/, "");
  if (domain && domain !== settings.value.apiDomain) {
    const granted = await ensureHostPermission(domain);
    if (!granted) {
      permError.value = "Permission denied for this domain";
      return;
    }
  }
  settings.value.apiDomain = domain;
  settings.value.theme = theme.value;
  settings.value.accent = accent.value as any;
  settings.value.language = language.value;
  settings.value.uiScale = Math.max(
    25,
    Math.min(150, Math.round(uiScale.value)),
  );
  settings.value.animationsEnabled = animationsEnabled.value;
  saveSettings();
  applyTheme(theme.value);
  applyAccent(accent.value as any);
  setLanguage(language.value);
  saved.value = true;
  setTimeout(() => (saved.value = false), 2000);
}

const importLoading = ref(false);
const importMessage = ref("");
const fileInput = ref<HTMLInputElement | null>(null);

async function handleExport() {
  try {
    const data = await exportAllData();
    downloadExportData(data);
  } catch {
    importMessage.value = t("settings.exportError");
    setTimeout(() => (importMessage.value = ""), 3000);
  }
}

function triggerImport() {
  fileInput.value?.click();
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!confirm(t("settings.importConfirm"))) {
    input.value = "";
    return;
  }

  importLoading.value = true;
  try {
    const text = await file.text();
    const data = JSON.parse(text) as ExportData;
    await importAllData(data);
    importMessage.value = t("settings.importSuccess");
    setTimeout(() => location.reload(), 1500);
  } catch {
    importLoading.value = false;
    importMessage.value = t("settings.importError");
    setTimeout(() => (importMessage.value = ""), 3000);
  }
  input.value = "";
}
</script>

<template>
  <div
    class="min-h-screen bg-background text-foreground p-8"
    :class="{ 'animations-disabled': !settings.animationsEnabled }"
  >
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
          <p
            v-if="permError"
            class="mt-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {{ permError }}
          </p>
        </div>

        <div>
          <label class="form-label">{{ t("options.theme") }}</label>
          <select v-model="theme" class="input-base mt-1">
            <option v-for="tm in themes" :key="tm" :value="tm">
              {{ t(`themes.${tm}`) }}
            </option>
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

        <div>
          <label class="form-label">{{ t("settings.uiScale") }}</label>
          <div class="mt-2 flex gap-2">
            <button
              v-for="val in [100, 125, 150, 175]"
              :key="val"
              class="rounded-lg border px-3 py-1.5 text-sm transition"
              :class="
                uiScale === val
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-foreground/10 text-muted-foreground hover:bg-muted'
              "
              @click="
                uiScale = val;
                handleSave();
              "
            >
              {{ val }}%
            </button>
          </div>
        </div>

        <div>
          <label class="form-label">{{ t("settings.animations") }}</label>
          <label
            class="mt-2 flex h-9 items-center gap-2 whitespace-nowrap text-sm text-foreground cursor-pointer"
          >
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-foreground/20"
              v-model="animationsEnabled"
              @change="handleSave"
            />
            <span>{{ t("settings.animationsHint") }}</span>
          </label>
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

      <div class="card-base space-y-4">
        <h2 class="form-label">{{ t("settings.dataManagement") }}</h2>
        <p class="form-hint">{{ t("settings.exportDataHint") }}</p>
        <div class="flex gap-3">
          <button class="btn-primary" @click="handleExport">
            <IconDownload :size="16" />
            {{ t("settings.exportData") }}
          </button>
          <button
            class="btn-primary"
            :disabled="importLoading"
            @click="triggerImport"
          >
            <IconLoader2 v-if="importLoading" :size="16" class="animate-spin" />
            <IconUpload v-else :size="16" />
            {{ t("settings.importData") }}
          </button>
        </div>
        <p
          v-if="importMessage"
          class="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary"
        >
          {{ importMessage }}
        </p>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="handleImportFile"
        />
      </div>
    </div>
  </div>
</template>
