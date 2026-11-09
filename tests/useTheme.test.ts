import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTheme } from "@/composables/useTheme";
import { writeSettings, defaultSettings } from "@/lib/settings";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return { fire: () => listeners.forEach((cb) => cb()) };
}

describe("useTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
    localStorage.clear();
  });

  it("exposes themes and accents lists", () => {
    const { themes, accents } = useTheme();
    expect(themes).toEqual(["light", "dark", "system"]);
    expect(accents.map((a) => a.key)).toContain("indigo");
  });

  it("applyTheme toggles the dark class", () => {
    mockMatchMedia(false);
    const { applyTheme } = useTheme();
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("system theme follows the prefers-color-scheme media query", () => {
    mockMatchMedia(true);
    const { applyTheme } = useTheme();
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    mockMatchMedia(false);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applyAccent sets --primary and swaps the favicon", () => {
    mockMatchMedia(false);
    const { applyAccent } = useTheme();
    applyAccent("emerald");
    const value = document.documentElement.style.getPropertyValue("--primary");
    expect(value).toBe("150 70% 40%");
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(icon).toBeTruthy();
    expect(icon!.href.startsWith("data:image/svg+xml")).toBe(true);
    expect(icon!.href).toContain(encodeURIComponent("150 70% 40%"));
  });

  it("initTheme applies persisted settings", () => {
    mockMatchMedia(false);
    writeSettings({ ...defaultSettings, theme: "dark", accent: "pink" });
    const { initTheme } = useTheme();
    initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe(
      "330 80% 60%",
    );
  });
});
