import { ref } from "vue";
import { readSettings, writeSettings, type ExtensionSettings } from "@/lib/settings";

const settings = ref<ExtensionSettings>(readSettings());

export function useSettings() {
  function saveSettings() {
    writeSettings(settings.value);
  }

  return {
    settings,
    saveSettings,
  };
}
