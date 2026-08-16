import { describe, it, expect, vi } from "vitest";
import { mapApiError } from "@/lib/apiErrors";

function makeT() {
  return vi.fn((key: string) => `translated:${key}`);
}

describe("mapApiError", () => {
  it("maps known error codes to translated messages", () => {
    const t = makeT();
    const result = mapApiError(new Error("tasks.readonly"), t);
    expect(result).toBe("translated:board.readOnlyError");
  });

  it("maps agile_not_available error", () => {
    const t = makeT();
    const result = mapApiError(new Error("tasks.agile_not_available"), t);
    expect(result).toBe("translated:board.agileNotAvailable");
  });

  it("falls back to original message for unknown errors", () => {
    const t = makeT();
    const result = mapApiError(new Error("some.unknown.error"), t);
    expect(result).toBe("some.unknown.error");
  });

  it("handles non-Error inputs", () => {
    const t = makeT();
    const result = mapApiError("string error", t);
    expect(result).toBe("string error");
  });
});
