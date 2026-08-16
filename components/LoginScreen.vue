<script setup lang="ts">
import { ref, onMounted } from "vue";
import { LogIn, Loader2 } from "lucide-vue-next";
import { useSettings } from "@/composables/useSettings";
import { useI18n } from "@/composables/useI18n";
import Logo from "@/components/Logo.vue";

const { t } = useI18n();

const props = defineProps<{
  error?: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ login: [] }>();

const { settings, saveSettings } = useSettings();
const serverUrl = ref("");

onMounted(() => {
  serverUrl.value = settings.value.apiDomain || "https://yourtask.app";
});

function handleLogin() {
  const url = serverUrl.value.trim().replace(/\/+$/, "");
  if (url) {
    settings.value.apiDomain = url;
    saveSettings();
  }
  emit("login");
}
</script>

<template>
  <div class="flex h-screen flex-col items-center justify-center gap-6">
    <Logo path="/logos/logo-cat.svg" :accent="settings.accent" :size="64" />
    <div class="text-center">
      <h1 class="text-3xl font-semibold text-foreground">
        {{ t("app.name") }}
      </h1>
      <p class="mt-2 text-muted-foreground">{{ t("app.tagline") }}</p>
    </div>

    <div class="w-full max-w-sm space-y-4">
      <div>
        <label class="form-label">{{ t("login.serverUrl") }}</label>
        <input
          v-model="serverUrl"
          type="text"
          class="input-base mt-1"
          :placeholder="t('login.serverUrlPlaceholder')"
          @keyup.enter="handleLogin"
        />
        <p class="form-hint mt-1">
          {{ t("login.serverUrlHint") }}
        </p>
      </div>

      <div
        v-if="props.error"
        class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {{ props.error }}
      </div>

      <button
        class="btn-primary w-full"
        :disabled="props.loading"
        @click="handleLogin"
      >
        <Loader2 v-if="props.loading" :size="18" class="animate-spin" />
        <LogIn v-else :size="18" />
        {{ props.loading ? t("login.connecting") : t("login.signIn") }}
      </button>
    </div>
  </div>
</template>
