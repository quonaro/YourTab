import { describe, it, expect } from "vitest";
import en from "@/lib/locales/en";
import ru from "@/lib/locales/ru";

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefix];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      keys.push(...keyPaths(v, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

function leafValues(obj: unknown, prefix = ""): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") return { [prefix]: obj };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      Object.assign(out, leafValues(v, path));
    } else {
      out[path] = v;
    }
  }
  return out;
}

describe("locales", () => {
  it("en and ru expose the same key set", () => {
    const enKeys = keyPaths(en);
    const ruKeys = keyPaths(ru);
    expect(ruKeys).toEqual(enKeys);
  });

  it("has no empty-string values in either locale", () => {
    for (const [path, v] of Object.entries(leafValues(en))) {
      expect(v, `en:${path} should not be empty`).not.toBe("");
    }
    for (const [path, v] of Object.entries(leafValues(ru))) {
      expect(v, `ru:${path} should not be empty`).not.toBe("");
    }
  });

  it("all leaf values are strings", () => {
    for (const [path, v] of Object.entries(leafValues(en))) {
      expect(typeof v, `en:${path}`).toBe("string");
    }
    for (const [path, v] of Object.entries(leafValues(ru))) {
      expect(typeof v, `ru:${path}`).toBe("string");
    }
  });
});
