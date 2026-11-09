import { describe, it, expect } from "vitest";
import { isOrgReadOnly, isAgileAvailable } from "@/composables/useBilling";
import type { Organization } from "@/lib/types";

const org = (over: Partial<Organization> = {}): Organization => ({
  id: 1,
  slug: "acme",
  name: "Acme",
  ...over,
});

describe("isOrgReadOnly", () => {
  it("is false for null org", () => {
    expect(isOrgReadOnly(null)).toBe(false);
  });

  it("is false when billing is not enabled (no subscriptionStatus)", () => {
    expect(isOrgReadOnly(org())).toBe(false);
  });

  it("is false for an active subscription", () => {
    expect(isOrgReadOnly(org({ subscriptionStatus: "active" }))).toBe(false);
  });

  it("is true for expired/suspended subscriptions", () => {
    expect(isOrgReadOnly(org({ subscriptionStatus: "expired" }))).toBe(true);
    expect(isOrgReadOnly(org({ subscriptionStatus: "suspended" }))).toBe(true);
  });
});

describe("isAgileAvailable", () => {
  it("is true for null org", () => {
    expect(isAgileAvailable(null)).toBe(true);
  });

  it("is true when billing is not enabled (no featureFlags)", () => {
    expect(isAgileAvailable(org())).toBe(true);
  });

  it("is true when agile flag is set", () => {
    expect(isAgileAvailable(org({ featureFlags: { agile: true } }))).toBe(true);
  });

  it("is false when agile flag is missing or false", () => {
    expect(isAgileAvailable(org({ featureFlags: {} }))).toBe(false);
    expect(isAgileAvailable(org({ featureFlags: { agile: false } }))).toBe(
      false,
    );
  });
});
