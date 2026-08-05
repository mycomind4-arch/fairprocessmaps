/**
 * Actor-aware event emission — Phase 1D + 1E hardening.
 *
 * Every event records actor provenance:
 *   actor_type: human | agent | system | government_source
 *   actor_id:   user_id | agent_name | "system" | source_name
 *   actor_organization_id: the org context of the actor
 *   resource_organization_id: the org that owns the affected resource
 *   agent_version: version of the agent (for AI provenance)
 *
 * Uses existing tables:
 *   - timeline_events (with actor + resource columns from migrations 008-009)
 *   - audit_logs (from migration 004, append-only — never UPDATE/DELETE)
 *   - events (canonical event store from migration 005)
 */

import type { Actor, AuthUser } from "./types";

// ── Actor helpers ──────────────────────────────────────────────────────────────

export function humanActor(user: AuthUser): Actor {
  return {
    type: "human",
    id: user.id,
    organization_id: user.organization_id,
  };
}

export function agentActor(
  agentName: string,
  organizationId: string | null,
  agentVersion?: string,
): Actor {
  return {
    type: "agent",
    id: agentName,
    organization_id: organizationId,
    agent_version: agentVersion,
  };
}

export function systemActor(organizationId: string | null): Actor {
  return {
    type: "system",
    id: "system",
    organization_id: organizationId,
  };
}

export function governmentSourceActor(
  sourceName: string,
  organizationId: string | null,
): Actor {
  return {
    type: "government_source",
    id: sourceName,
    organization_id: organizationId,
  };
}

// ── Timeline event emission ───────────────────────────────────────────────────

export interface EventEmitParams {
  db: D1Database;
  projectId: string;
  evidenceId?: string | null;
  eventDate: string;
  eventType: string;
  description: string;
  actor: Actor;
  resourceOrganizationId?: string | null;
}

export async function emitTimelineEvent(params: EventEmitParams): Promise<string> {
  const { db, projectId, evidenceId, eventDate, eventType, description, actor } = params;

  // If resource org not specified, default to actor's org
  const resourceOrgId = params.resourceOrganizationId ?? actor.organization_id;

  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO timeline_events
        (id, project_id, evidence_id, event_date, event_type, description,
         organization_id, actor_type, actor_id, actor_organization_id,
         resource_organization_id, agent_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      evidenceId ?? null,
      eventDate,
      eventType,
      description,
      actor.organization_id,
      actor.type,
      actor.id,
      actor.organization_id,
      resourceOrgId,
      actor.agent_version ?? null,
    )
    .run();

  return id;
}

// ── Audit event emission (append-only — never UPDATE/DELETE) ──────────────────

export interface AuditEmitParams {
  db: D1Database;
  actor: Actor;
  action: string;
  resourceType?: string;
  resourceId?: string;
  detail?: string;
}

export async function emitAuditEvent(params: AuditEmitParams): Promise<string> {
  const { db, actor, action, resourceType, resourceId, detail } = params;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO audit_logs
        (id, organization_id, actor_type, actor_id, actor_name, action,
         resource_type, resource_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      actor.organization_id,
      actor.type,
      actor.id,
      actor.id,
      action,
      resourceType ?? null,
      resourceId ?? null,
      detail ?? null,
    )
    .run();

  return id;
}

// ── Canonical event store emission ────────────────────────────────────────────

export interface CanonicalEventParams {
  db: D1Database;
  caseId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actor: Actor;
  title?: string;
  description?: string;
  severity?: string;
  resourceOrganizationId?: string | null;
}

export async function emitCanonicalEvent(params: CanonicalEventParams): Promise<string> {
  const { db, caseId, eventType, entityType, entityId, actor, title, description, severity } = params;

  const resourceOrgId = params.resourceOrganizationId ?? actor.organization_id;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO events
        (id, case_id, event_type, entity_type, entity_id,
         actor_type, actor_id, actor_name, severity, title, description,
         resource_organization_id, agent_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      caseId,
      eventType,
      entityType,
      entityId,
      actor.type,
      actor.id,
      actor.id,
      severity ?? "info",
      title ?? null,
      description ?? null,
      resourceOrgId,
      actor.agent_version ?? null,
    )
    .run();

  return id;
}
