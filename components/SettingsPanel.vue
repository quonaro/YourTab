<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  IconX,
  IconLogin,
  IconLogout,
  IconLoader2,
  IconDownload,
  IconUpload,
} from "@tabler/icons-vue";
import {
  exportAllData,
  importAllData,
  downloadExportData,
  type ExportData,
} from "@/lib/localDb";
import { useSettings } from "@/composables/useSettings";
import { useTheme } from "@/composables/useTheme";
import { useI18n, setLanguage } from "@/composables/useI18n";
import { useAuth } from "@/composables/useAuth";
import type { Language } from "@/lib/settings";

const { t } = useI18n();
const { settings, saveSettings } = useSettings();
const { applyTheme, applyAccent, themes, accents } = useTheme();
const {
  isAuthenticated,
  user,
  login,
  logout,
  loading: authLoading,
  error: authError,
} = useAuth();

const open = defineModel<boolean>("open", { default: false });

const apiDomain = ref("");
const theme = ref<"light" | "dark" | "system">("system");
const accent = ref<string>("indigo");
const language = ref<Language>("ru");
const uiScale = ref(75);
const animationsEnabled = ref(true);
const saved = ref(false);

onMounted(() => {
  apiDomain.value = settings.value.apiDomain;
  theme.value = settings.value.theme;
  accent.value = settings.value.accent;
  language.value = settings.value.language;
  uiScale.value = settings.value.uiScale;
  animationsEnabled.value = settings.value.animationsEnabled;
});

function handleSave() {
  settings.value.apiDomain = apiDomain.value;
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

async function handleConnect() {
  const url = apiDomain.value.trim().replace(/\/+$/, "");
  if (url) {
    settings.value.apiDomain = url;
    saveSettings();
  }
  await login();
}

function handleDisconnect() {
  logout();
}

function close() {
  open.value = false;
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
  <!-- Backdrop -->
  <div v-if="open" class="fixed inset-0 z-40 bg-black/30" @click="close" />

  <!-- Panel -->
  <aside
    class="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-foreground/10 bg-background shadow-xl transition-transform duration-200"
    :class="open ? 'translate-x-0' : 'translate-x-full'"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-foreground/10 px-4 py-3"
    >
      <h2 class="text-sm font-semibold text-foreground">
        {{ t("settings.title") }}
      </h2>
      <button
        class="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
        @click="close"
      >
        <IconX :size="18" />
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 space-y-6 overflow-y-auto p-4">
      <!-- Server connection -->
      <section class="space-y-3">
        <h3 class="form-label">
          {{ t("settings.serverConnection") }}
        </h3>

        <div
          v-if="isAuthenticated"
          class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-foreground">
                {{ user?.login }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ apiDomain || "yourtask.app" }}
              </p>
            </div>
            <button
              class="btn-small text-destructive"
              @click="handleDisconnect"
            >
              <IconLogout :size="14" />
              {{ t("settings.disconnect") }}
            </button>
          </div>
        </div>

        <div v-else class="space-y-2">
          <input
            v-model="apiDomain"
            type="text"
            class="input-base text-sm"
            :placeholder="t('login.serverUrlPlaceholder')"
          />
          <button
            class="btn-primary w-full"
            :disabled="authLoading"
            @click="handleConnect"
          >
            <IconLoader2 v-if="authLoading" :size="16" class="animate-spin" />
            <IconLogin v-else :size="16" />
            {{
              authLoading ? t("login.connecting") : t("settings.connectServer")
            }}
          </button>
          <div
            v-if="authError"
            class="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {{ authError }}
          </div>
        </div>
      </section>

      <hr class="border-foreground/10" />

      <!-- Appearance -->
      <section class="space-y-3">
        <h3 class="form-label">{{ t("settings.appearance") }}</h3>

        <div>
          <label class="form-hint">{{ t("options.theme") }}</label>
          <select
            v-model="theme"
            class="input-base mt-1 text-sm"
            @change="handleSave"
          >
            <option v-for="tm in themes" :key="tm" :value="tm">
              {{ t(`themes.${tm}`) }}
            </option>
          </select>
        </div>

        <div>
          <label class="form-hint">{{ t("options.accentColor") }}</label>
          <div class="mt-2 flex gap-2">
            <button
              v-for="a in accents"
              :key="a.key"
              class="h-7 w-7 rounded-full border-2 transition"
              :class="
                accent === a.key ? 'border-foreground' : 'border-transparent'
              "
              :style="{ backgroundColor: `hsl(${a.value})` }"
              @click="
                accent = a.key;
                handleSave();
              "
            />
          </div>
        </div>

        <div>
          <label class="form-hint">{{ t("options.language") }}</label>
          <select
            v-model="language"
            class="input-base mt-1 text-sm"
            @change="handleSave"
          >
            <option value="ru">{{ t("languages.ru") }}</option>
            <option value="en">{{ t("languages.en") }}</option>
          </select>
        </div>

        <div>
          <label class="form-hint">{{ t("settings.uiScale") }}</label>
          <div class="mt-2 flex gap-2">
            <button
              v-for="val in [80, 100, 125, 150, 175]"
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
          <label class="form-hint" for="animations-switch">{{
            t("settings.animations")
          }}</label>
          <p class="text-xs text-muted-foreground">
            {{ t("settings.animationsHint") }}
          </p>
          <div class="mt-2 inline-flex items-center gap-3">
            <button
              id="animations-switch"
              role="switch"
              :aria-checked="animationsEnabled"
              class="relative h-6 w-11 rounded-full transition focus:outline-none focus:ring-2 focus:ring-primary/50"
              :class="
                animationsEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
              "
              @click="
                animationsEnabled = !animationsEnabled;
                handleSave();
              "
            >
              <span
                class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform"
                :class="animationsEnabled ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
            <span class="text-sm text-foreground">{{
              animationsEnabled ? t("common.on") : t("common.off")
            }}</span>
          </div>
        </div>
      </section>

      <hr class="border-foreground/10" />

      <!-- Data export/import -->
      <section class="space-y-3">
        <h3 class="form-label">{{ t("settings.dataManagement") }}</h3>
        <div class="flex gap-2">
          <button class="btn-small flex-1" @click="handleExport">
            <IconDownload :size="14" />
            {{ t("settings.exportData") }}
          </button>
          <button
            class="btn-small flex-1"
            :disabled="importLoading"
            @click="triggerImport"
          >
            <IconLoader2 v-if="importLoading" :size="14" class="animate-spin" />
            <IconUpload v-else :size="14" />
            {{ t("settings.importData") }}
          </button>
        </div>
        <p class="form-hint">{{ t("settings.exportDataHint") }}</p>
        <p
          v-if="importMessage"
          class="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary"
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
      </section>

      <div class="flex items-center gap-2 pt-2">
        <span v-if="saved" class="text-xs text-muted-foreground">{{
          t("options.saved")
        }}</span>
      </div>
    </div>
  </aside>
</template>
