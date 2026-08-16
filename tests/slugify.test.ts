import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/localDb";

describe("slugify", () => {
  it("converts basic Latin names", () => {
    expect(slugify("My Project")).toBe("my-project");
    expect(slugify("Hello World 123")).toBe("hello-world-123");
  });

  it("transliterates Cyrillic characters", () => {
    expect(slugify("Мой проект")).toBe("moy-proekt");
    expect(slugify("привет")).toBe("privet");
  });

  it("handles special characters and spaces", () => {
    expect(slugify("Test @#$ Project!")).toBe("test-project");
    expect(slugify("  multiple   spaces  ")).toBe("multiple-spaces");
  });

  it("returns 'project' for empty or symbol-only input", () => {
    expect(slugify("")).toBe("project");
    expect(slugify("@#$%!")).toBe("project");
  });

  it("handles numbers", () => {
    expect(slugify("Project 42")).toBe("project-42");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("---test---")).toBe("test");
  });
});
