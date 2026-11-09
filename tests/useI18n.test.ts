import { describe, it, expect } from "vitest";
import { useI18n, setLanguage } from "@/composables/useI18n";
import en from "@/lib/locales/en";
import ru from "@/lib/locales/ru";

function firstLeaf(obj: unknown, prefix = ""): [string, string] {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      const r = firstLeaf(v, path);
      if (r) return r;
    } else {
      return [path, v as string];
    }
  }
  return ["", ""];
}

describe("useI18n", () => {
  it("translates a nested key in the active locale", () => {
    setLanguage("en");
    const { t } = useI18n();
    const [path, expected] = firstLeaf(en);
    expect(t(path)).toBe(expected);
  });

  it("switches between locales", () => {
    const { t, locale } = useI18n();
    const [path] = firstLeaf(en);
    setLanguage("en");
    expect(t(path)).toBe(firstLeaf(en)[1]);
    setLanguage("ru");
    expect(t(path)).toBe(firstLeaf(ru)[1]);
    expect(locale.value).toBe("ru");
    setLanguage("en");
  });

  it("returns the key itself for unknown paths", () => {
    const { t } = useI18n();
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("returns the path for non-string leaf values", () => {
    const { t } = useI18n();
    // A path that resolves to a subtree (object), not a string.
    const branch = Object.keys(en).find(
      (k) => typeof (en as Record<string, unknown>)[k] === "object",
    )!;
    expect(t(branch)).toBe(branch);
  });
});
