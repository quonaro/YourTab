import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins plain strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("skips falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("includes numbers", () => {
    expect(cn("p", 4)).toBe("p 4");
  });

  it("flattens nested arrays", () => {
    expect(cn(["a", ["b", ["c"]]], "d")).toBe("a b c d");
  });

  it("includes object keys only when value is truthy", () => {
    expect(cn({ active: true, hidden: false, visible: true })).toBe(
      "active visible",
    );
  });

  it("combines strings, arrays and objects", () => {
    expect(cn("base", ["x", { y: true, z: false }], { end: 1 })).toBe(
      "base x y end",
    );
  });

  it("returns empty string for no truthy input", () => {
    expect(cn()).toBe("");
    expect(cn(false, null, undefined, {})).toBe("");
  });
});
