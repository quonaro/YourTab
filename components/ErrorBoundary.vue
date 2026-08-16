<script setup lang="ts">
import { ref, onErrorCaptured } from "vue";
import { IconRefresh, IconAlertTriangle } from "@tabler/icons-vue";

const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err instanceof Error ? err : new Error(String(err));
  return false;
});

function reload() {
  location.reload();
}

function dismiss() {
  error.value = null;
}
</script>

<template>
  <div
    v-if="error"
    class="flex min-h-[200px] flex-col items-center justify-center gap-4 p-8 text-center"
  >
    <IconAlertTriangle :size="40" class="text-destructive" />
    <div class="space-y-1">
      <p class="text-sm font-medium text-foreground">Something went wrong</p>
      <p class="max-w-md text-xs text-muted-foreground">{{ error.message }}</p>
    </div>
    <div class="flex gap-2">
      <button class="btn-primary" @click="reload">
        <IconRefresh :size="14" />
        Reload
      </button>
      <button class="btn-small" @click="dismiss">Dismiss</button>
    </div>
  </div>
  <slot v-else />
</template>
