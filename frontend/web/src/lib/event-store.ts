/**
 * FairProcess Event Store & Relationship Engine
 * 
 * The foundational layer for FairProcess's unified information model.
 * Every change anywhere becomes an Event. Every entity knows its relationships.
 * 
 * Timeline, Audit Log, Notifications, and Activity Feed are all projections
 * of the same event stream — no duplication.
 * 
 * Temporal Provenance:
 *   event_date  = when the action actually occurred (may be in the past)
 *   created_at  = when the database row was inserted (auto by D1)
 *   For real-time events (upload, user action), event_date = created_at.
 *   For discovered events (CE notice served, permit issued), event_date = action date.
 */

// ── Types ──

export type EventType =
  | "evidence.uploaded"
  | "evidence.processed"
  | "evidence.flagged"
  | "finding.created"
  | "finding.resolved"
  | "ce.case_created"
  | "ce.notice_served"
  | "ce.hearing_scheduled"
  | "ce.compliance_deadline"
  | "ce.abatement"
  | "ce.appeal_filed"
  | "ce.closed"
  | "permit.created"
  | "permit.issued"
  | "permit.inspection"
  | "permit.finalized"
  | "permit.expired"
  | "recon.started"
  | "recon.completed"
  | "analysis.started"
  | "analysis.completed"
  | "case.created"
  | "case.updated"
  | "case.closed"
  | "relationship.created";

export type EntityType =
  | "evidence" | "finding" | "ce_case" | "permit" | "property"
  | "timeline_event" | "statute" | "official" | "department"
  | "authority" | "case" | "project" | "recon" | "analysis";

export type ActorType = "user" | "ai_agent" | "system" | "scraper";

export type Severity = "debug" | "info" | "warning" | "critical";

export type RelationshipType =
  | "supported_by" | "mandated_by" | "generated_from" | "issued_by"
  | "member_of" | "delegated_by" | "authorized_by" | "references"
  | "relates_to" | "triggered_by";

export interface EventPayload {
  case_id: string;
  event_type: EventType | string;
  entity_type: EntityType | string;
  entity_id: string;
  actor_type?: ActorType;
  actor_id?: string;
  actor_name?: string;
  severity?: Severity;
  event_date?: string; // When the action occurred (defaults to now)
  title?: string;
  description?: string;
  payload?: Record<string, any>;
}

export interface RelationshipPayload {
  case_id: string;
  source_type: EntityType | string;
  source_id: string;
  target_type: EntityType | string;
  target_id: string;
  relationship_type: RelationshipType | string;
  metadata?: Record<string, any>;
}

export interface StoredEvent {
  id: string;
  case_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  severity: string;
  event_date: string | null;
  title: string | null;
  description: string | null;
  payload: string | null;
  created_at: string;
}

export interface StoredRelationship {
  id: string;
  case_id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  metadata: string | null;
  created_at: string;
}

// ── Event Emission ──

/**
 * Emit an event to the event store.
 * NEVER fails the caller — if the event store write fails, it logs and continues.
 * This is critical: event emission must never break the main operation.
 */
export async function emitEvent(db: D1Database, event: EventPayload): Promise<string | null> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO events (id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, actor_name, severity, event_date, title, description, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      event.case_id,
      event.event_type,
      event.entity_type,
      event.entity_id,
      event.actor_type || "system",
      event.actor_id || null,
      event.actor_name || null,
      event.severity || "info",
      event.event_date || now, // When the action occurred (defaults to now)
      event.title || null,
      event.description || null,
      event.payload ? JSON.stringify(event.payload) : null
    ).run();
    return id;
  } catch (err) {
    console.error("[event-store] emitEvent failed:", err);
    return null;
  }
}

/**
 * Emit multiple events in parallel. All are best-effort.
 */
export async function emitEvents(db: D1Database, events: EventPayload[]): Promise<void> {
  await Promise.allSettled(events.map((e) => emitEvent(db, e)));
}

// ── Relationship Creation ──

/**
 * Create a typed relationship between two entities.
 * Idempotent — if the relationship already exists, it's a no-op.
 * Only emits a relationship.created event when a NEW relationship is actually created.
 */
export async function createRelationship(
  db: D1Database,
  rel: RelationshipPayload
): Promise<string | null> {
  const id = crypto.randomUUID();
  try {
    const result = await db.prepare(
      `INSERT OR IGNORE INTO relationships (id, case_id, source_type, source_id, target_type, target_id, relationship_type, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      rel.case_id,
      rel.source_type,
      rel.source_id,
      rel.target_type,
      rel.target_id,
      rel.relationship_type,
      rel.metadata ? JSON.stringify(rel.metadata) : null
    ).run();

    // Only emit event if a row was actually inserted
    const wasInserted = (result as any)?.meta?.changes > 0;

    if (wasInserted) {
      await emitEvent(db, {
        case_id: rel.case_id,
        event_type: "relationship.created",
        entity_type: "relationship",
        entity_id: id,
        actor_type: "system",
        title: `${rel.source_type} → ${rel.relationship_type} → ${rel.target_type}`,
        payload: {
          source_type: rel.source_type,
          source_id: rel.source_id,
          target_type: rel.target_type,
          target_id: rel.target_id,
          relationship_type: rel.relationship_type,
        },
      });
      return id;
    }

    // Relationship already existed — no event, no new ID
    return null;
  } catch (err) {
    console.error("[event-store] createRelationship failed:", err);
    return null;
  }
}

// ── Event Queries (Projections) ──

/**
 * Query events — the foundation for Timeline, Audit Log, Notifications, Activity Feed.
 */
export async function queryEvents(
  db: D1Database,
  filters: {
    case_id?: string;
    event_type?: string;
    entity_type?: string;
    entity_id?: string;
    actor_type?: string;
    severity?: string;
    limit?: number;
    offset?: number;
    since?: string;
  }
): Promise<StoredEvent[]> {
  const conditions: string[] = [];
  const binds: any[] = [];

  if (filters.case_id) { conditions.push("case_id = ?"); binds.push(filters.case_id); }
  if (filters.event_type) { conditions.push("event_type = ?"); binds.push(filters.event_type); }
  if (filters.entity_type) { conditions.push("entity_type = ?"); binds.push(filters.entity_type); }
  if (filters.entity_id) { conditions.push("entity_id = ?"); binds.push(filters.entity_id); }
  if (filters.actor_type) { conditions.push("actor_type = ?"); binds.push(filters.actor_type); }
  if (filters.severity) { conditions.push("severity = ?"); binds.push(filters.severity); }
  if (filters.since) { conditions.push("created_at > ?"); binds.push(filters.since); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const result = await db.prepare(
    `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  return (result.results || []) as unknown as StoredEvent[];
}

/**
 * Get the event stream for a case — this IS the Timeline.
 * Sorts by event_date (when the action occurred), falling back to created_at.
 */
export async function getCaseTimeline(db: D1Database, caseId: string, limit = 200): Promise<StoredEvent[]> {
  const result = await db.prepare(
    `SELECT e.* FROM events e
     LEFT JOIN event_types et ON e.event_type = et.code
     WHERE e.case_id = ? AND (et.is_timeline_visible = 1 OR et.id IS NULL)
     ORDER BY COALESCE(e.event_date, e.created_at) DESC
     LIMIT ?`
  ).bind(caseId, limit).all();

  return (result.results || []) as unknown as StoredEvent[];
}

/**
 * Get the audit log for a case — events that are audit-worthy.
 */
export async function getCaseAuditLog(db: D1Database, caseId: string, limit = 200): Promise<StoredEvent[]> {
  const result = await db.prepare(
    `SELECT e.* FROM events e
     LEFT JOIN event_types et ON e.event_type = et.code
     WHERE e.case_id = ? AND (et.is_audit_worthy = 1 OR et.id IS NULL)
     ORDER BY e.created_at DESC
     LIMIT ?`
  ).bind(caseId, limit).all();

  return (result.results || []) as unknown as StoredEvent[];
}

/**
 * Get notification-worthy events for a user's cases.
 */
export async function getNotifications(db: D1Database, caseIds: string[], since?: string, limit = 50): Promise<StoredEvent[]> {
  if (caseIds.length === 0) return [];

  const placeholders = caseIds.map(() => "?").join(",");
  const conditions = [`e.case_id IN (${placeholders})`];
  const binds: any[] = [...caseIds];

  if (since) { conditions.push("e.created_at > ?"); binds.push(since); }

  const result = await db.prepare(
    `SELECT e.* FROM events e
     LEFT JOIN event_types et ON e.event_type = et.code
     WHERE ${conditions.join(" AND ")} AND (et.is_notification_worthy = 1 OR et.id IS NULL)
     ORDER BY e.created_at DESC
     LIMIT ?`
  ).bind(...binds, limit).all();

  return (result.results || []) as unknown as StoredEvent[];
}

// ── Relationship Queries (Graph Traversal) ──

export async function getRelationshipsFrom(
  db: D1Database,
  sourceType: string,
  sourceId: string,
  relationshipType?: string
): Promise<StoredRelationship[]> {
  const conditions = ["source_type = ?", "source_id = ?"];
  const binds: any[] = [sourceType, sourceId];

  if (relationshipType) {
    conditions.push("relationship_type = ?");
    binds.push(relationshipType);
  }

  const result = await db.prepare(
    `SELECT * FROM relationships WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`
  ).bind(...binds).all();

  return (result.results || []) as unknown as StoredRelationship[];
}

export async function getRelationshipsTo(
  db: D1Database,
  targetType: string,
  targetId: string,
  relationshipType?: string
): Promise<StoredRelationship[]> {
  const conditions = ["target_type = ?", "target_id = ?"];
  const binds: any[] = [targetType, targetId];

  if (relationshipType) {
    conditions.push("relationship_type = ?");
    binds.push(relationshipType);
  }

  const result = await db.prepare(
    `SELECT * FROM relationships WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`
  ).bind(...binds).all();

  return (result.results || []) as unknown as StoredRelationship[];
}

export async function getCaseRelationships(db: D1Database, caseId: string): Promise<StoredRelationship[]> {
  const result = await db.prepare(
    `SELECT * FROM relationships WHERE case_id = ? ORDER BY created_at DESC`
  ).bind(caseId).all();

  return (result.results || []) as unknown as StoredRelationship[];
}

export async function getConnectedEntities(
  db: D1Database,
  entityType: string,
  entityId: string
): Promise<{ relationships: StoredRelationship[]; direction: "source" | "target" }[]> {
  const [fromResults, toResults] = await Promise.all([
    getRelationshipsFrom(db, entityType, entityId),
    getRelationshipsTo(db, entityType, entityId),
  ]);

  return [
    ...fromResults.map((r) => ({ relationships: [r], direction: "source" as const })),
    ...toResults.map((r) => ({ relationships: [r], direction: "target" as const })),
  ];
}

/**
 * Traverse the relationship graph from a finding.
 * Traverses: finding → supported_by → evidence → issued_by → official → member_of → department → delegated_by → authority → authorized_by → statute
 * Also: finding → mandated_by → statute (direct)
 */
export async function getAuthorityChain(
  db: D1Database,
  findingId: string
): Promise<{
  evidence: StoredRelationship[];
  officials: StoredRelationship[];
  departments: StoredRelationship[];
  authorities: StoredRelationship[];
  statutes: StoredRelationship[];
}> {
  const evidence = await getRelationshipsFrom(db, "finding", findingId, "supported_by");

  const officials: StoredRelationship[] = [];
  for (const ev of evidence) {
    const offs = await getRelationshipsFrom(db, "evidence", ev.target_id, "issued_by");
    officials.push(...offs);
  }

  const departments: StoredRelationship[] = [];
  for (const off of officials) {
    const depts = await getRelationshipsFrom(db, "official", off.target_id, "member_of");
    departments.push(...depts);
  }

  const authorities: StoredRelationship[] = [];
  for (const dept of departments) {
    const auths = await getRelationshipsFrom(db, "department", dept.target_id, "delegated_by");
    authorities.push(...auths);
  }

  const statutes: StoredRelationship[] = [];
  for (const auth of authorities) {
    const stats = await getRelationshipsFrom(db, "authority", auth.target_id, "authorized_by");
    statutes.push(...stats);
  }

  const directStatutes = await getRelationshipsFrom(db, "finding", findingId, "mandated_by");
  statutes.push(...directStatutes);

  return { evidence, officials, departments, authorities, statutes };
}

// ── Timeline Mapping ──

export function eventToTimelineDisplay(event: StoredEvent): {
  event_type: string;
  title: string;
  description: string | null;
  entity_type: string;
  entity_id: string;
  event_date: string;
  created_at: string;
} {
  const TYPE_MAP: Record<string, string> = {
    "evidence.uploaded": "evidence_uploaded",
    "evidence.processed": "evidence_processed",
    "evidence.flagged": "evidence_flagged",
    "finding.created": "finding_created",
    "finding.resolved": "finding_resolved",
    "ce.case_created": "ce_case_created",
    "ce.notice_served": "notice_sent",
    "ce.hearing_scheduled": "hearing_held",
    "ce.compliance_deadline": "deadline",
    "ce.abatement": "abatement",
    "ce.appeal_filed": "appeal_filed",
    "ce.closed": "ce_closed",
    "permit.created": "permit_created",
    "permit.issued": "permit_issued",
    "permit.inspection": "inspection",
    "permit.finalized": "permit_finalized",
    "permit.expired": "permit_expired",
    "recon.completed": "intelligence_gathered",
    "analysis.completed": "analysis_completed",
    "case.created": "case_created",
    "case.closed": "case_closed",
  };

  let payload: any = null;
  try {
    payload = event.payload ? JSON.parse(event.payload) : null;
  } catch {}

  return {
    event_type: TYPE_MAP[event.event_type] || event.event_type.replace(/\./g, "_"),
    title: event.title || event.event_type,
    description: event.description || (payload?.description) || null,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    event_date: event.event_date || event.created_at,
    created_at: event.created_at,
  };
}

// ── High-level convenience ──

export async function emitEventWithRelationships(
  db: D1Database,
  event: EventPayload,
  relationships: RelationshipPayload[]
): Promise<{ eventId: string | null; relationshipIds: (string | null)[] }> {
  const eventId = await emitEvent(db, event);
  const relationshipIds = await Promise.all(
    relationships.map((r) => createRelationship(db, r))
  );
  return { eventId, relationshipIds };
}

// ── Finding Fingerprint ──
// Used to determine if a finding is new or already existed before an analysis run.
// This prevents re-emitting finding.created events on re-analysis.

export function findingFingerprint(finding: {
  project_id: string;
  rule: string;
  evidence_id: string | null;
  detail: string | null;
}): string {
  return `${finding.project_id}:${finding.rule}:${finding.evidence_id || "none"}:${finding.detail?.slice(0, 200) || "none"}`;
}
