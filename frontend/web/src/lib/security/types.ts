/**
 * Security types for the trust boundary layer (Phase 1D).
 *
 * Identity model: User → Membership → Organization
 * Every API request resolves an AuthUser containing id, organization_id, and role.
 */

// ── Roles ──────────────────────────────────────────────────────────────────

export type Role = "admin" | "investigator" | "attorney" | "advocate" | "reviewer" | "viewer";

export const ALL_ROLES: Role[] = ["admin", "investigator", "attorney", "advocate", "reviewer", "viewer"];

// ── Actor Types ─────────────────────────────────────────────────────────────

export type ActorType = "human" | "agent" | "system" | "government_source";

export interface Actor {
  type: ActorType;
  id: string;
  organization_id: string | null;
}

// ── Authenticated User ───────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: Role;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type Action =
  | "case.read"
  | "case.update"
  | "property.read"
  | "property.update"
  | "evidence.read"
  | "evidence.upload"
  | "evidence.withdraw"
  | "finding.read"
  | "finding.review"
  | "relationship.read"
  | "relationship.create"
  | "event.read"
  | "admin.debug";

// ── Authorization Result ─────────────────────────────────────────────────────

export interface AuthzResult {
  allowed: boolean;
  reason?: string;
}

// ── Auth Result (from middleware) ────────────────────────────────────────────

export interface AuthSuccess {
  ok: true;
  user: AuthUser;
}

export interface AuthFailure {
  ok: false;
  status: number;
  error: string;
}

export type AuthResult = AuthSuccess | AuthFailure;

// ── Resource (for resource-level checks) ─────────────────────────────────────

export interface Resource {
  organization_id?: string;
  project_id?: string;
}
