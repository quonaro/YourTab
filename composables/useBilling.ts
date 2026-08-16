import type { Organization } from "@/lib/types";

/**
 * Returns true when the organization is in read-only billing state
 * (subscription expired, suspended, or no active subscription).
 * When billing is not enabled on the backend, subscriptionStatus is
 * undefined — the org is NOT read-only (self-hosted full access).
 */
export function isOrgReadOnly(org: Organization | null): boolean {
  if (!org || !org.subscriptionStatus) return false;
  return org.subscriptionStatus !== "active";
}

/**
 * Returns true when the organization's plan includes the agile feature
 * (boards and sprints). When billing is not enabled, featureFlags is
 * undefined — agile is available (self-hosted full access).
 */
export function isAgileAvailable(org: Organization | null): boolean {
  if (!org || !org.featureFlags) return true;
  return org.featureFlags["agile"] === true;
}
