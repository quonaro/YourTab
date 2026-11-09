import { describe, it, expect, beforeEach } from "vitest";
import {
  readSettings,
  writeSettings,
  defaultSettings,
  readLastLocation,
  writeLastLocation,
  readSidebarCollapsed,
  writeSidebarCollapsed,
  SETTINGS_KEY,
} from "@/lib/settings";

describe("readSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when storage is empty", () => {
    expect(readSettings()).toEqual(defaultSettings);
  });

  it("returns defaults on corrupted JSON", () => {
    localStorage.setItem(SETTINGS_KEY, "{not json");
    expect(readSettings()).toEqual(defaultSettings);
  });

  it("restores saved values", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        apiDomain: "https://example.com",
        theme: "dark",
        accent: "emerald",
        language: "en",
        uiScale: 120,
        animationsEnabled: false,
        aiPanelWidth: 600,
        quickLinks: [{ id: "1", name: "L", url: "https://x", icon: "i" }],
      }),
    );
    const s = readSettings();
    expect(s.theme).toBe("dark");
    expect(s.accent).toBe("emerald");
    expect(s.language).toBe("en");
    expect(s.uiScale).toBe(120);
    expect(s.animationsEnabled).toBe(false);
    expect(s.aiPanelWidth).toBe(600);
    expect(s.quickLinks).toHaveLength(1);
  });

  it("falls back to defaults for missing keys", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "light" }));
    const s = readSettings();
    expect(s.theme).toBe("light");
    expect(s.accent).toBe(defaultSettings.accent);
    expect(s.quickLinks).toEqual([]);
  });

  it("rejects unknown accent keys", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accent: "neon" }));
    expect(readSettings().accent).toBe(defaultSettings.accent);
  });

  it("clamps uiScale to the 25–150 range", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ uiScale: 10 }));
    expect(readSettings().uiScale).toBe(defaultSettings.uiScale);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ uiScale: 500 }));
    expect(readSettings().uiScale).toBe(defaultSettings.uiScale);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ uiScale: 150 }));
    expect(readSettings().uiScale).toBe(150);
  });

  it("clamps aiPanelWidth to the 320–1200 range", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiPanelWidth: 100 }));
    expect(readSettings().aiPanelWidth).toBe(defaultSettings.aiPanelWidth);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiPanelWidth: 9000 }));
    expect(readSettings().aiPanelWidth).toBe(defaultSettings.aiPanelWidth);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ aiPanelWidth: 900 }));
    expect(readSettings().aiPanelWidth).toBe(900);
  });

  it("rejects non-array quickLinks", () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ quickLinks: { a: 1 } }),
    );
    expect(readSettings().quickLinks).toEqual([]);
  });
});

describe("writeSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips through readSettings", () => {
    const s = { ...defaultSettings, theme: "dark" as const, uiScale: 110 };
    writeSettings(s);
    expect(readSettings()).toEqual(s);
  });
});

describe("last location", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns nulls when nothing stored", () => {
    expect(readLastLocation()).toEqual({ org: null, project: null });
  });

  it("round-trips stored values", () => {
    writeLastLocation({ org: "acme", project: "web" });
    expect(readLastLocation()).toEqual({ org: "acme", project: "web" });
  });

  it("handles corrupted JSON", () => {
    localStorage.setItem("yourtask-last-location", "broken{");
    expect(readLastLocation()).toEqual({ org: null, project: null });
  });
});

describe("sidebar collapsed", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to false", () => {
    expect(readSidebarCollapsed()).toBe(false);
  });

  it("round-trips true/false", () => {
    writeSidebarCollapsed(true);
    expect(readSidebarCollapsed()).toBe(true);
    writeSidebarCollapsed(false);
    expect(readSidebarCollapsed()).toBe(false);
  });
});
