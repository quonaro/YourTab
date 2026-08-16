import {
  readSettings,
  ACCENTS,
  type Theme,
  type AccentKey,
} from "@/lib/settings";
import faviconSvgRaw from "@/assets/logo-cat.svg?raw";

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

    const colored = faviconSvgRaw.replace(
      /fill="currentColor"/g,
      `fill="hsl(${value})"`,
    );
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(colored)}`;

    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = dataUrl;
    document.head.appendChild(link);
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
