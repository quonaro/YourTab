import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { useSettings } from "@/composables/useSettings";
import { SETTINGS_KEY, readSettings } from "@/lib/settings";

describe("useSettings", () => {
  it("exposes the shared settings ref initialized from storage", () => {
    const { settings } = useSettings();
    expect(settings.value).toEqual(readSettings());
  });

  it("persists mutations to localStorage via the deep watcher", async () => {
    const { settings } = useSettings();
    settings.value = { ...settings.value, uiScale: 90, theme: "dark" };
    await nextTick();
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(stored.uiScale).toBe(90);
    expect(stored.theme).toBe("dark");
  });

  it("saveSettings writes current state", () => {
    const { settings, saveSettings } = useSettings();
    settings.value = { ...settings.value, accent: "pink" };
    saveSettings();
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).accent).toBe("pink");
  });

  it("syncs changes coming from a storage event", () => {
    const { settings } = useSettings();
    const incoming = { ...settings.value, uiScale: 66 };
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SETTINGS_KEY,
        newValue: JSON.stringify(incoming),
      }),
    );
    expect(settings.value.uiScale).toBe(66);
  });

  it("ignores storage events for other keys and malformed payloads", () => {
    const { settings } = useSettings();
    const scale = settings.value.uiScale;
    window.dispatchEvent(
      new StorageEvent("storage", { key: "other", newValue: "{}" }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SETTINGS_KEY,
        newValue: "{broken",
      }),
    );
    expect(settings.value.uiScale).toBe(scale);
  });
});
