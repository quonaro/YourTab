import {
  readSettings,
  ACCENTS,
  type Theme,
  type AccentKey,
} from "@/lib/settings";

const themes: Theme[] = ["light", "dark", "system"];
const accents = Object.entries(ACCENTS).map(([key, val]) => ({
  key: key as AccentKey,
  label: val.label,
  value: val.value,
}));

export function useTheme() {
  function applyTheme(theme: Theme) {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "system" && prefersDark);
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }

  function applyAccent(accent: AccentKey) {
    const value = ACCENTS[accent]?.value ?? ACCENTS.indigo.value;
    document.documentElement.style.setProperty("--primary", value);
  }

  function initTheme() {
    const settings = readSettings();
    applyTheme(settings.theme);
    applyAccent(settings.accent);

    // Listen for system theme changes
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const s = readSettings();
      if (s.theme === "system") {
        applyTheme("system");
      }
    });
  }

  return {
    themes,
    accents,
    applyTheme,
    applyAccent,
    initTheme,
  };
}
