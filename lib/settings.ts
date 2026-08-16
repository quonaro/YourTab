export const SETTINGS_KEY = "yourtask-settings";

export type Theme = "light" | "dark" | "system";
export type AccentKey =
  | "indigo" | "blue" | "emerald" | "orange" | "purple" | "pink" | "cyan";
export type Language = "ru" | "en";

export interface QuickLink {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export interface ExtensionSettings {
  apiDomain: string;
  theme: Theme;
  accent: AccentKey;
  language: Language;
  quickLinks: QuickLink[];
  uiScale: number; // percent (50–150)
  animationsEnabled: boolean;
}

export const defaultSettings: ExtensionSettings = {
  apiDomain: "",
  theme: "system",
  accent: "indigo",
  language: "ru",
  quickLinks: [],
  uiScale: 100,
  animationsEnabled: true,
};

export const ACCENTS: Record<AccentKey, { label: string; value: string }> = {
  indigo: { label: "Indigo", value: "245 60% 55%" },
  blue: { label: "Blue", value: "217 90% 60%" },
  emerald: { label: "Emerald", value: "150 70% 40%" },
  orange: { label: "Orange", value: "25 95% 53%" },
  purple: { label: "Purple", value: "270 60% 55%" },
  pink: { label: "Pink", value: "330 80% 60%" },
  cyan: { label: "Cyan", value: "190 80% 45%" },
};

export function readSettings(): ExtensionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<ExtensionSettings>;
    return {
      apiDomain: parsed.apiDomain ?? defaultSettings.apiDomain,
      theme: parsed.theme ?? defaultSettings.theme,
      accent:
        parsed.accent && parsed.accent in ACCENTS
          ? (parsed.accent as AccentKey)
          : defaultSettings.accent,
      language: parsed.language ?? defaultSettings.language,
      quickLinks: Array.isArray(parsed.quickLinks)
        ? (parsed.quickLinks as QuickLink[])
        : defaultSettings.quickLinks,
      uiScale: typeof parsed.uiScale === "number" && parsed.uiScale >= 25 && parsed.uiScale <= 150
        ? parsed.uiScale
        : defaultSettings.uiScale,
      animationsEnabled: parsed.animationsEnabled ?? defaultSettings.animationsEnabled,
 };
  } catch {
    return defaultSettings;
  }
}

export function writeSettings(settings: ExtensionSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ─── Last location persistence ───

const LAST_LOCATION_KEY = "yourtask-last-location";

export interface LastLocation {
  org: string | null;
  project: string | null;
}

export function readLastLocation(): LastLocation {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return { org: null, project: null };
    const parsed = JSON.parse(raw);
    return { org: parsed.org ?? null, project: parsed.project ?? null };
  } catch {
    return { org: null, project: null };
  }
}

export function writeLastLocation(loc: LastLocation): void {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // ignore
  }
}

// ─── Sidebar collapsed state persistence ───

const SIDEBAR_COLLAPSED_KEY = "yourtask-sidebar-collapsed";

export function readSidebarCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore
  }
}
