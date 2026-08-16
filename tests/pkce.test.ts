import { describe, it, expect } from "vitest";
import { generateRandomString, base64URLEncode } from "@/lib/pkce";

describe("generateRandomString", () => {
  it("generates string of specified length", () => {
    const result = generateRandomString(32);
    expect(result).toHaveLength(32);
  });

  it("generates string of length 64", () => {
    const result = generateRandomString(64);
    expect(result).toHaveLength(64);
  });

  it("only uses valid PKCE characters", () => {
    const result = generateRandomString(100);
    expect(result).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("generates different strings on subsequent calls", () => {
    const a = generateRandomString(64);
    const b = generateRandomString(64);
    expect(a).not.toBe(b);
  });
});

describe("base64URLEncode", () => {
  it("encodes empty buffer", () => {
    const buf = new ArrayBuffer(0);
    expect(base64URLEncode(buf)).toBe("");
  });

  it("produces URL-safe base64 (no +, /, =)", () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode("test string for encoding").buffer;
    const result = base64URLEncode(buf);
    expect(result).not.toMatch(/[+/=]/);
  });
});
