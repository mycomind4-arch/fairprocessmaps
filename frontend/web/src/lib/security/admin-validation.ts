/**
 * Pure validation helpers for the admin org-management routes
 * (org-members, organization, property-projects status). Extracted so
 * they're unit-testable without a D1/NextRequest mocking harness — the
 * routes themselves stay thin wrappers, matching how this codebase tests
 * business logic in lib/ rather than route handlers directly.
 */

import type { Role } from "./types";

// Mirrors the Role union in ./types.ts — TypeScript unions have no runtime
// form, so this list must be kept in sync with that type by hand, the same
// way security/authorization.ts's PERMISSIONS map keys on it.
export const VALID_ROLES: Role[] = [
  "admin", "investigator", "attorney", "advocate", "reviewer", "viewer", "manager", "analyst",
];

export function isValidRole(role: unknown): role is Role {
  return typeof role === "string" && (VALID_ROLES as string[]).includes(role);
}

export type MemberStatus = "active" | "suspended" | "removed";
export const VALID_MEMBER_STATUSES: MemberStatus[] = ["active", "suspended", "removed"];

export function isValidMemberStatus(status: unknown): status is MemberStatus {
  return typeof status === "string" && (VALID_MEMBER_STATUSES as string[]).includes(status);
}

export const VALID_PROJECT_STATUSES = ["open", "in_progress", "on_hold", "closed", "archived"];

export function isValidProjectStatus(status: unknown): status is string {
  return typeof status === "string" && VALID_PROJECT_STATUSES.includes(status);
}

/**
 * A cryptographically random temporary password for a newly-invited
 * account. Generated server-side rather than accepted from the admin's own
 * input — avoids a lazily-typed weak password landing on a real account.
 * ~20 URL-safe characters from 16 random bytes — well above any minimum
 * length this app enforces elsewhere, and never persisted in plaintext.
 */
export function generateTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20);
}
