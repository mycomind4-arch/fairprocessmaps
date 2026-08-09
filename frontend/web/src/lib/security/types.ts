/**
 * Security type definitions — Phase 1D + 1E hardening.
 */

export type Role =
  | "admin"
  | "investigator"
  | "attorney"
  | "advocate"
  | "reviewer"
  | "viewer"
  | "manager"
  | "analyst";

export type ActorType = "human" | "agent" | "system" | "government_source";

export interface Actor {
  type: ActorType;
  id: string;
  organization_id: string | null;
  agent_version?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  organization_id: string;
  role: Role;
  actor_type?: ActorType;
}

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
  | "relationship.review"
  | "event.read"
  | "communication.read"
  | "communication.create"
  | "analysis.run"
  | "admin.debug"
  | "agent.run"
  | "agent.review"
  | "agent.read";

export interface Resource {
  organization_id?: string;
  project_id?: string;
}

export interface AuthzResult {
  allowed: boolean;
  reason?: string;
}

export interface AuthSuccess {
  ok: true;
  user: AuthUser;
}

export interface AuthFailure {
  ok: false;
  response?: Response;
  error?: string;
  status?: number;
}

export type AuthResult = AuthSuccess | AuthFailure;
