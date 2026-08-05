/**
 * Actor-aware event emission — Phase 1D.
 *
 * Every event (timeline + audit) records actor provenance:
 *   actor_type: human | agent | system | government_source
 *   actor_id:   user_id | agent_name | "system" | source_name
 *   actor_organization_id: the org context
 *
 * Uses existing tables from migrations 004-007:
 *   - timeline_events (with new actor columns from migration 008)
 *   - audit_logs (from migration 004, actor_type/actor_id already present)
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

// ── Timeline event emission ───────────────────────────────────────────────────
// Uses timeline_events table (existing) with actor provenance columns (migration 008).

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
// Uses audit_logs table (from migration 004) which already has actor_type/actor_id.

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
      actor.id, // actor_name = same as actor_id for identification
      action,
      resourceType ?? null,
      resourceId ?? null,
      detail ?? null,
    )
    .run();

  return id;
}

// ── Canonical event store emission ────────────────────────────────────────────
// Uses the events table from migration 005 (append-only, source-backed).
// This is the canonical event store that supports replay.

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
}

export async function emitCanonicalEvent(params: CanonicalEventParams): Promise<string> {
  const { db, caseId, eventType, entityType, entityId, actor, title, description, severity } = params;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO events
        (id, case_id, event_type, entity_type, entity_id,
         actor_type, actor_id, actor_name, severity, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    )
    .run();

  return id;
}
