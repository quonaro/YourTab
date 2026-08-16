import { ref, watch } from "vue";
import {
  readSettings,
  writeSettings,
  type ExtensionSettings,
} from "@/lib/settings";

// Module-level singleton state — shared across all useSettings() callers in the same page.
const settings = ref<ExtensionSettings>(readSettings());

let watcherInstalled = false;
function ensureWatcher() {
  if (watcherInstalled) return;
  watcherInstalled = true;
  watch(settings, (val) => writeSettings(val), { deep: true });

  window.addEventListener("storage", (e) => {
    if (e.key === "yourtask-settings" && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Partial<ExtensionSettings>;
        settings.value = { ...settings.value, ...parsed };
      } catch {
        // ignore
      }
    }
  });
}

export function useSettings() {
  ensureWatcher();

  function saveSettings() {
    writeSettings(settings.value);
  }

  return {
    settings,
    saveSettings,
  };
}
