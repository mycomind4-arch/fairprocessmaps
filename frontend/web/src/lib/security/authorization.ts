/**
 * Centralized authorization — Phase 1D.
 *
 * authorize(user, action, resource?) → AuthzResult
 *
 * DO NOT put authorization checks directly inside routes.
 * Every route calls this function.
 */

import type { Action, AuthUser, AuthzResult, Role, Resource } from "./types";

// ── Role → Action permission matrix ──────────────────────────────────────────

const PERMISSIONS: Record<Role, Set<Action>> = {
  admin: new Set<Action>([
    "case.read", "case.update",
    "property.read", "property.update",
    "evidence.read", "evidence.upload", "evidence.withdraw",
    "finding.read", "finding.review",
    "relationship.read", "relationship.create", "relationship.review",
    "event.read",
    "admin.debug",
    "agent.read", "agent.run", "agent.review",
  ]),

  investigator: new Set<Action>([
    "case.read", "case.update",
    "property.read",
    "evidence.read", "evidence.upload", "evidence.withdraw",
    "finding.read",
    "relationship.read", "relationship.create",
    "event.read",
    "agent.read", "agent.run",
  ]),

  attorney: new Set<Action>([
    "case.read", "case.update",
    "property.read",
    "evidence.read", "evidence.upload",
    "finding.read", "finding.review",
    "relationship.read", "relationship.create", "relationship.review",
    "event.read",
    "agent.read", "agent.run", "agent.review",
  ]),

  advocate: new Set<Action>([
    "case.read",
    "property.read",
    "evidence.read", "evidence.upload",
    "finding.read",
    "relationship.read",
    "event.read",
    "agent.read",
  ]),

  reviewer: new Set<Action>([
    "case.read",
    "property.read",
    "evidence.read",
    "finding.read", "finding.review",
    "relationship.read", "relationship.review",
    "event.read",
    "agent.read", "agent.review",
  ]),

  viewer: new Set<Action>([
    "case.read",
    "property.read",
    "evidence.read",
    "finding.read",
    "relationship.read",
    "event.read",
    "agent.read",
  ]),

  manager: new Set<Action>([
    "case.read", "case.update",
    "property.read", "property.update",
    "evidence.read", "evidence.upload", "evidence.withdraw",
    "finding.read", "finding.review",
    "relationship.read", "relationship.create", "relationship.review",
    "event.read",
    "agent.read", "agent.run", "agent.review",
  ]),

  analyst: new Set<Action>([
    "case.read",
    "property.read",
    "evidence.read",
    "finding.read",
    "relationship.read",
    "event.read",
    "agent.read",
  ]),
};

// ── Agent permissions (separate from human roles) ────────────────────────────
// Agents can READ and create analysis, but cannot modify evidence, findings,
// events, or authority chains.

export const AGENT_PERMISSIONS = new Set<Action>([
  "case.read",
  "property.read",
  "evidence.read",
  "finding.read",
  "relationship.read",
  "event.read",
  "agent.read",
]);

// ── authorize() ──────────────────────────────────────────────────────────────

export function authorize(
  user: AuthUser,
  action: Action,
  resource?: Resource,
): AuthzResult {
  // 1. Check role has the action
  const allowed = PERMISSIONS[user.role]?.has(action) ?? false;
  if (!allowed) {
    return {
      allowed: false,
      reason: `Role '${user.role}' does not have permission for '${action}'`,
    };
  }

  // 2. Organization isolation — if resource has an org, it must match
  if (resource?.organization_id && resource.organization_id !== user.organization_id) {
    return {
      allowed: false,
      reason: "Resource belongs to a different organization",
    };
  }

  return { allowed: true };
}

// ── authorizeAgent() ─────────────────────────────────────────────────────────

export function authorizeAgent(action: Action): AuthzResult {
  if (!AGENT_PERMISSIONS.has(action)) {
    return {
      allowed: false,
      reason: `Agents do not have permission for '${action}'`,
    };
  }
  return { allowed: true };
}

// ── Helper: check if a role can perform an action (no resource) ─────────────

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[role]?.has(action) ?? false;
}
