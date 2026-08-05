/**
 * Actor-aware event emission — Phase 1D.
 *
 * Every event (timeline + audit) records actor provenance:
 *   actor_type: human | agent | system | government_source
 *   actor_id:   user_id | agent_name | "system" | source_name
 *   actor_organization_id: the org context
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

export function agentActor(agentName: string, organizationId: string | null): Actor {
  return {
    type: "agent",
    id: agentName,
    organization_id: organizationId,
  };
}

export function systemActor(organizationId: string | null): Actor {
  return {
    type: "system",
    id: "system",
    organization_id: organizationId,
  };
}

export function governmentSourceActor(sourceName: string, organizationId: string | null): Actor {
  return {
    type: "government_source",
    id: sourceName,
    organization_id: organizationId,
  };
}

// ── Event emission ─────────────────────────────────────────────────────────────

export interface EventEmitParams {
  db: D1Database;
  projectId: string;
  evidenceId?: string | null;
  eventDate: string;
  eventType: string;
  description: string;
  actor: Actor;
}

export async function emitTimelineEvent(params: EventEmitParams): Promise<string> {
  const { db, projectId, evidenceId, eventDate, eventType, description, actor } = params;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO timeline_events
        (id, project_id, evidence_id, event_date, event_type, description,
         organization_id, actor_type, actor_id, actor_organization_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    )
    .run();

  return id;
}

// ── Audit event emission ──────────────────────────────────────────────────────

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
      `INSERT INTO audit_events
        (id, organization_id, actor_type, actor_id, actor_organization_id,
         action, resource_type, resource_id, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      actor.organization_id,
      actor.type,
      actor.id,
      actor.organization_id,
      action,
      resourceType ?? null,
      resourceId ?? null,
      detail ?? null,
    )
    .run();

  return id;
}
