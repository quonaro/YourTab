<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import {
  IconX,
  IconLogin,
  IconLogout,
  IconLoader2,
  IconServer,
} from "@tabler/icons-vue";
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
const autoRefreshEnabled = ref(false);
const autoRefreshInterval = ref(60);
const uiScale = ref(75);
const saved = ref(false);

onMounted(() => {
  apiDomain.value = settings.value.apiDomain;
  theme.value = settings.value.theme;
  accent.value = settings.value.accent;
  language.value = settings.value.language;
  autoRefreshEnabled.value = settings.value.autoRefreshEnabled;
  autoRefreshInterval.value = settings.value.autoRefreshInterval;
  uiScale.value = settings.value.uiScale;
});

function handleSave() {
  settings.value.apiDomain = apiDomain.value;
  settings.value.theme = theme.value;
  settings.value.accent = accent.value as any;
  settings.value.language = language.value;
  settings.value.autoRefreshEnabled = autoRefreshEnabled.value;
  settings.value.autoRefreshInterval = Math.max(
    5,
    Math.round(autoRefreshInterval.value),
  );
  settings.value.uiScale = Math.max(
    25,
    Math.min(150, Math.round(uiScale.value)),
  );
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
        <h3 class="form-label flex items-center gap-1.5">
          <IconServer :size="14" />
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

      <!-- Auto-refresh -->
      <section class="space-y-3">
        <label class="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            class="h-4 w-4 rounded border-foreground/20"
            v-model="autoRefreshEnabled"
            @change="handleSave"
          />
          <span>{{ t("settings.autoRefresh") }}</span>
        </label>
        <div v-if="autoRefreshEnabled" class="flex items-center gap-2 pl-6">
          <input
            v-model.number="autoRefreshInterval"
            type="number"
            min="5"
            step="5"
            class="input-base w-20 text-sm"
            @change="handleSave"
          />
          <span class="form-hint">{{ t("settings.autoRefreshInterval") }}</span>
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
      </section>

      <div class="flex items-center gap-2 pt-2">
        <span v-if="saved" class="text-xs text-muted-foreground">{{
          t("options.saved")
        }}</span>
      </div>
    </div>
  </aside>
</template>
