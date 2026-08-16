import { ref, computed } from "vue";
import { readSettings, type Language } from "@/lib/settings";
import en from "@/lib/locales/en";
import ru from "@/lib/locales/ru";

const messages = { en, ru } as const;

const currentLanguage = ref<Language>(readSettings().language);

export function setLanguage(lang: Language) {
  currentLanguage.value = lang;
}

export function useI18n() {
  const t = computed(() => messages[currentLanguage.value] ?? messages.en);

  function translate(path: string): string {
    const keys = path.split(".");
    let result: unknown = t.value;
    for (const key of keys) {
      if (result && typeof result === "object" && key in result) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return path;
      }
    }
    return typeof result === "string" ? result : path;
  }

  return {
    locale: currentLanguage,
    t: translate,
  };
}
