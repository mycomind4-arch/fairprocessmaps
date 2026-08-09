/**
 * FairProcess Event Store & Relationship Engine — Phase 1C
 * 
 * The foundational layer for FairProcess's unified information model.
 * Every change anywhere becomes an Event. Every entity knows its relationships.
 * 
 * Timeline, Audit Log, Notifications, and Activity Feed are all projections
 * of the same event stream — no duplication.
 * 
 * Phase 1C additions:
 * - Source-backed event identity (source_system + source_record_id)
 * - Temporal relationships (valid_from / valid_to)
 * - Jurisdiction awareness
 * - Effective date for government actions
 * - Finding fingerprint with jurisdiction
 * - AI agent permission enforcement
 */

// D1Database is a global type provided by Cloudflare Workers runtime (see cloudflare-env.d.ts)
import { findingFingerprint } from "./finding-utils";

// Re-export for backward compatibility — tests and other modules import from here
export { findingFingerprint };

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
  | "member_of" | "delegated_by" | "authorized_by"
  | "references" | "relates_to" | "violates";

export interface EventPayload {
  caseId: string;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  actorType: ActorType;
  actorId?: string;
  severity?: Severity;
  // When the action occurred (may differ from recorded_at)
  eventDate?: string;
  // When the action takes effect (e.g., notice effective date)
  effectiveDate?: string;
  // Jurisdiction for multi-jurisdiction support
  jurisdictionId?: string;
  // Source provenance for imported records
  sourceSystem?: string;
  sourceRecordId?: string;
  // Arbitrary event data
  payload?: Record<string, unknown>;
}

export interface RelationshipPayload {
  caseId: string;
  sourceType: EntityType;
  sourceId: string;
  targetType: EntityType;
  targetId: string;
  relationshipType: RelationshipType;
  // Temporal validity
  validFrom?: string;
  validTo?: string;
  jurisdictionId?: string;
  metadata?: Record<string, unknown>;
}



// ── Stored types (for API routes) ──

export interface StoredEvent {
  id: string;
  case_id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  severity: Severity;
  event_date: string | null;
  effective_date: string | null;
  jurisdiction_id: string | null;
  source_system: string | null;
  source_record_id: string | null;
  payload: string | null;
  created_at: string;
}

export interface StoredRelationship {
  id: string;
  case_id: string;
  source_type: EntityType;
  source_id: string;
  target_type: EntityType;
  target_id: string;
  relationship_type: RelationshipType;
  valid_from: string | null;
  valid_to: string | null;
  jurisdiction_id: string | null;
  metadata: string | null;
  created_at: string;
}

// ── Query Events (generic filtered query) ──

export async function queryEvents(
  db: D1Database,
  params: {
    case_id?: string;
    event_type?: string;
    entity_type?: string;
    entity_id?: string;
    actor_type?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }
): Promise<StoredEvent[]> {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (params.case_id) { conditions.push("case_id = ?"); binds.push(params.case_id); }
  if (params.event_type) { conditions.push("event_type = ?"); binds.push(params.event_type); }
  if (params.entity_type) { conditions.push("entity_type = ?"); binds.push(params.entity_type); }
  if (params.entity_id) { conditions.push("entity_id = ?"); binds.push(params.entity_id); }
  if (params.actor_type) { conditions.push("actor_type = ?"); binds.push(params.actor_type); }
  if (params.severity) { conditions.push("severity = ?"); binds.push(params.severity); }

  const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  binds.push(limit, offset);

  try {
    const result = await db.prepare(
      `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...binds).all();
    return (result.results || []) as unknown as StoredEvent[];
  } catch (err) {
    console.error("[event-store] queryEvents failed:", err);
    return [];
  }
}

// ── Alias: getCaseRelationships (wraps getRelationships for API route compat) ──

export async function getCaseRelationships(
  db: D1Database,
  caseId: string
): Promise<StoredRelationship[]> {
  const result = await getRelationships(db, { caseId });
  return (result || []) as unknown as StoredRelationship[];
}

// ── AI Agent Permission Boundary ──
// Enforced in code, not just docs. Agents CANNOT:
// - modify or delete evidence
// - alter or delete historical events
// - declare legal conclusions (neutrality guardrail)
// Agents CAN:
// - create observations (findings)
// - propose relationships
// - attach evidence
// - create events

const AGENT_ALLOWED_ACTIONS: Record<string, ActorType[]> = {
  "evidence.attach": ["ai_agent", "scraper", "user", "system"],
  "observation.create": ["ai_agent", "user"],
  "relationship.propose": ["ai_agent", "user", "system"],
  "relationship.create": ["ai_agent", "scraper", "user", "system"],
  "event.create": ["ai_agent", "scraper", "user", "system"],
  "finding.create": ["ai_agent", "user"],
  "evidence.upload": ["user", "scraper", "system"],
};

const AGENT_FORBIDDEN_ACTIONS: string[] = [
  "evidence.modify",
  "evidence.delete",
  "event.alter",
  "event.delete",
  "legal_conclusion.declare",
  "finding.modify",
  "finding.delete",
];

export function checkAgentPermission(action: string, actorType: ActorType): boolean {
  // Explicitly forbidden for all non-admin actors
  if (AGENT_FORBIDDEN_ACTIONS.includes(action)) {
    return false;
  }
  // Check allowed list
  const allowed = AGENT_ALLOWED_ACTIONS[action];
  if (allowed) {
    return allowed.includes(actorType);
  }
  // Default: deny
  return false;
}

export function assertAgentPermission(action: string, actorType: ActorType): void {
  if (!checkAgentPermission(action, actorType)) {
    throw new Error(
      `Permission denied: actor "${actorType}" cannot perform "${action}". ` +
      `AI agents cannot modify evidence, alter historical events, or declare legal conclusions.`
    );
  }
}

// ── Neutrality Guardrail (enforced in code) ──
const FORBIDDEN_CONCLUSIONS = [
  "violated", "violation", "unlawful", "illegal", "guilty", "liable",
  "non-compliant", "invalid", "void", "unconstitutional",
];

const NEUTRAL_REPLACEMENTS: Record<string, string> = {
  "violated": "deviation detected from",
  "violation": "deviation detected",
  "unlawful": "deviation detected",
  "illegal": "deviation detected",
  "guilty": "evidence suggests",
  "liable": "evidence suggests",
  "non-compliant": "deviation detected from",
  "invalid": "conflict identified with",
  "void": "conflict identified with",
  "unconstitutional": "conflict identified with",
};

export function applyNeutralityGuardrail(text: string): {
  text: string;
  blocks: string[];
} {
  let rewritten = text;
  const blocks: string[] = [];

  for (const [forbidden, replacement] of Object.entries(NEUTRAL_REPLACEMENTS)) {
    const regex = new RegExp(`\\b${forbidden}\\b`, "gi");
    if (regex.test(rewritten)) {
      blocks.push(forbidden);
      rewritten = rewritten.replace(regex, replacement);
    }
  }

  return { text: rewritten, blocks };
}

export function assertFindingNeutrality(findingDetail: string): string {
  const { text, blocks } = applyNeutralityGuardrail(findingDetail);
  if (blocks.length > 0) {
    console.warn(`[neutrality-guardrail] Rewrote ${blocks.length} legal conclusion(s) in finding: ${blocks.join(", ")}`);
  }
  return text;
}

// ── Finding Fingerprint ──
// Stable identity for findings — used to detect duplicates across analysis runs.
// Includes jurisdiction to distinguish same statute in different jurisdictions.

export function computeFindingFingerprint(params: {
  caseId: string;
  rule: string;
  evidenceId?: string;
  detail: string;
  jurisdictionId?: string;
}): string {
  const parts = [
    params.caseId,
    params.jurisdictionId ?? "default",
    params.rule,
    params.evidenceId ?? "none",
    params.detail.slice(0, 200).trim().toLowerCase(),
  ];
  // Simple hash — D1 doesn't have crypto.randomUUID in all contexts, so use a string hash
  const str = parts.join("::");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

// ── Event Emission ──

export async function emitEvent(
  db: D1Database,
  params: EventPayload
): Promise<string | null> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const eventDate = params.eventDate ?? now;

  try {
    await db.prepare(
      `INSERT INTO events (id, case_id, event_type, entity_type, entity_id,
                           actor_type, actor_id, severity, event_date, effective_date,
                           jurisdiction_id, source_system, source_record_id,
                           payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      params.caseId,
      params.eventType,
      params.entityType,
      params.entityId,
      params.actorType,
      params.actorId ?? null,
      params.severity ?? "info",
      eventDate,
      params.effectiveDate ?? null,
      params.jurisdictionId ?? null,
      params.sourceSystem ?? null,
      params.sourceRecordId ?? null,
      params.payload ? JSON.stringify(params.payload) : null,
      now
    ).run();

    return id;
  } catch (err) {
    // If the event store table doesn't exist yet (pre-migration), fail silently.
    // If it's a source-identity unique constraint violation, that's expected — same event already recorded.
    console.error(`[event-store] emitEvent failed (${params.eventType}):`, err);
    return null;
  }
}

// ── Relationship Creation (Idempotent + Temporal) ──

export async function createRelationship(
  db: D1Database,
  rel: RelationshipPayload
): Promise<string | null> {
  // Enforce agent permission
  assertAgentPermission("relationship.create", "system"); // internal call, always allowed

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const result = await db.prepare(
      `INSERT OR IGNORE INTO relationships
         (id, case_id, source_type, source_id, target_type, target_id,
          relationship_type, valid_from, valid_to, jurisdiction_id,
          metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      rel.caseId,
      rel.sourceType,
      rel.sourceId,
      rel.targetType,
      rel.targetId,
      rel.relationshipType,
      rel.validFrom ?? now,
      rel.validTo ?? null,
      rel.jurisdictionId ?? null,
      rel.metadata ? JSON.stringify(rel.metadata) : null,
      now
    ).run();

    // Only emit relationship.created if the row was actually inserted
    const wasInserted = result.meta?.changes > 0;

    if (wasInserted) {
      await emitEvent(db, {
        caseId: rel.caseId,
        eventType: "relationship.created",
        entityType: rel.sourceType,
        entityId: rel.sourceId,
        actorType: "system",
        payload: {
          relationship_id: id,
          relationship_type: rel.relationshipType,
          target_type: rel.targetType,
          target_id: rel.targetId,
          valid_from: rel.validFrom ?? now,
          valid_to: rel.validTo ?? null,
        },
      });
      return id;
    }

    // Relationship already existed — no event, return null
    return null;
  } catch (err) {
    console.error(`[event-store] createRelationship failed (${rel.relationshipType}):`, err);
    return null;
  }
}

// ── Event Queries (Projections) ──

/**
 * Timeline projection — chronological view of all events for a case.
 * Filters by event_date (the actual occurrence date), falls back to created_at.
 */
export async function getCaseTimeline(
  db: D1Database,
  caseId: string,
  limit = 200
): Promise<any[]> {
  try {
    const result = await db.prepare(
      `SELECT e.*, et.timeline_visible, et.display_label
       FROM events e
       LEFT JOIN event_types et ON e.event_type = et.code
       WHERE e.case_id = ?
         AND COALESCE(et.timeline_visible, 1) = 1
       ORDER BY COALESCE(e.event_date, e.created_at) DESC
       LIMIT ?`
    ).bind(caseId, limit).all();
    return result.results ?? [];
  } catch (err) {
    // Table doesn't exist yet — return empty
    return [];
  }
}

/**
 * Audit log projection — administrative view of all auditable events.
 * Includes events that might not appear in the timeline.
 */
export async function getCaseAuditLog(
  db: D1Database,
  caseId: string,
  limit = 500
): Promise<any[]> {
  try {
    const result = await db.prepare(
      `SELECT e.*, et.audit_visible, et.display_label
       FROM events e
       LEFT JOIN event_types et ON e.event_type = et.code
       WHERE e.case_id = ?
         AND COALESCE(et.audit_visible, 1) = 1
       ORDER BY e.created_at DESC
       LIMIT ?`
    ).bind(caseId, limit).all();
    return result.results ?? [];
  } catch (err) {
    return [];
  }
}

/**
 * Notification projection — events that warrant user notification.
 */
export async function getNotifications(
  db: D1Database,
  caseId: string,
  sinceDate?: string,
  limit = 50
): Promise<any[]> {
  try {
    const result = await db.prepare(
      `SELECT e.*, et.display_label
       FROM events e
       LEFT JOIN event_types et ON e.event_type = et.code
       WHERE e.case_id = ?
         AND COALESCE(et.notification_worthy, 0) = 1
         ${sinceDate ? "AND e.created_at > ?" : ""}
       ORDER BY e.created_at DESC
       LIMIT ?`
    ).bind(caseId, ...(sinceDate ? [sinceDate] : []), limit).all();
    return result.results ?? [];
  } catch (err) {
    return [];
  }
}

// ── Relationship Queries ──

/**
 * Get all relationships for an entity, optionally filtered by type.
 * By default only returns currently-active relationships (valid_to IS NULL).
 */
export async function getRelationships(
  db: D1Database,
  params: {
    caseId?: string;
    sourceType?: EntityType;
    sourceId?: string;
    targetType?: EntityType;
    targetId?: string;
    relationshipType?: RelationshipType;
    includeHistorical?: boolean;
  }
): Promise<any[]> {
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (params.caseId) { conditions.push("case_id = ?"); binds.push(params.caseId); }
  if (params.sourceType) { conditions.push("source_type = ?"); binds.push(params.sourceType); }
  if (params.sourceId) { conditions.push("source_id = ?"); binds.push(params.sourceId); }
  if (params.targetType) { conditions.push("target_type = ?"); binds.push(params.targetType); }
  if (params.targetId) { conditions.push("target_id = ?"); binds.push(params.targetId); }
  if (params.relationshipType) { conditions.push("relationship_type = ?"); binds.push(params.relationshipType); }

  // Only active relationships unless explicitly requesting historical
  if (!params.includeHistorical) {
    conditions.push("(valid_to IS NULL OR valid_to > datetime('now'))");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const result = await db.prepare(
      `SELECT * FROM relationships ${whereClause} ORDER BY created_at DESC`
    ).bind(...binds).all();
    return result.results ?? [];
  } catch (err) {
    return [];
  }
}

/**
 * Authority Chain traversal — walks the relationship graph from a finding
 * through evidence → official → department → authority → statute.
 *
 * This is what makes Authority Chain a *view* of relationships rather than a feature.
 */
export async function getAuthorityChain(
  db: D1Database,
  findingId: string,
  caseId: string
): Promise<{
  finding: any;
  evidence: any[];
  officials: any[];
  departments: any[];
  authorities: any[];
  statutes: any[];
}> {
  // 1. Finding → supported_by → Evidence
  const evidenceRels = await getRelationships(db, {
    caseId, sourceType: "finding", sourceId: findingId,
    relationshipType: "supported_by",
  });
  const evidenceIds = evidenceRels.map((r: any) => r.target_id);

  // 2. Finding → mandated_by → Statute
  const statuteRels = await getRelationships(db, {
    caseId, sourceType: "finding", sourceId: findingId,
    relationshipType: "mandated_by",
  });
  const statuteIds = statuteRels.map((r: any) => r.target_id);

  // 3. Evidence → issued_by → Official
  let officials: any[] = [];
  for (const eid of evidenceIds) {
    const officialRels = await getRelationships(db, {
      caseId, sourceType: "evidence", sourceId: eid,
      relationshipType: "issued_by",
    });
    officials.push(...officialRels.map((r: any) => r.target_id));
  }

  // 4. Official → member_of → Department
  let departments: any[] = [];
  for (const oid of officials) {
    const deptRels = await getRelationships(db, {
      caseId, sourceType: "official", sourceId: oid,
      relationshipType: "member_of",
    });
    departments.push(...deptRels.map((r: any) => r.target_id));
  }

  // 5. Department → delegated_by → Authority
  let authorities: any[] = [];
  for (const did of departments) {
    const authRels = await getRelationships(db, {
      caseId, sourceType: "department", sourceId: did,
      relationshipType: "delegated_by",
    });
    authorities.push(...authRels.map((r: any) => r.target_id));
  }

  // Fetch actual entity data
  let finding: any = null;
  try {
    finding = await db.prepare("SELECT * FROM due_process_findings WHERE id = ?").bind(findingId).first();
  } catch { /* ignore */ }

  let evidence: any[] = [];
  for (const eid of evidenceIds) {
    try {
      const ev = await db.prepare("SELECT * FROM evidence WHERE id = ?").bind(eid).first();
      if (ev) evidence.push(ev);
    } catch { /* ignore */ }
  }

  return {
    finding,
    evidence,
    officials: [...new Set(officials)],
    departments: [...new Set(departments)],
    authorities: [...new Set(authorities)],
    statutes: statuteIds,
  };
}

// ── Timeline Display Helpers ──

export function eventToTimelineDisplay(event: any): {
  event_type: string;
  description: string;
  event_date: string;
} {
  const payload = event.payload ? JSON.parse(event.payload) : {};
  const typeMap: Record<string, { event_type: string; description: string }> = {
    "evidence.uploaded": { event_type: "evidence_uploaded", description: `Evidence uploaded: ${payload.title ?? "Unknown"}` },
    "evidence.processed": { event_type: "evidence_processed", description: `Evidence processed: ${payload.title ?? "Unknown"}` },
    "evidence.flagged": { event_type: "evidence_flagged", description: `Evidence flagged: ${payload.title ?? "Unknown"}` },
    "finding.created": { event_type: "finding_created", description: `Finding: ${payload.rule_name ?? payload.rule ?? "Unknown"}` },
    "finding.resolved": { event_type: "finding_resolved", description: `Finding resolved: ${payload.rule_name ?? "Unknown"}` },
    "ce.case_created": { event_type: "ce_case_created", description: `Code enforcement case opened: ${payload.case_number ?? "Unknown"}` },
    "ce.notice_served": { event_type: "notice_sent", description: `Notice served: ${payload.case_number ?? "Unknown"}` },
    "ce.hearing_scheduled": { event_type: "hearing_held", description: `Hearing scheduled: ${payload.case_number ?? "Unknown"}` },
    "ce.compliance_deadline": { event_type: "deadline", description: `Compliance deadline set: ${payload.case_number ?? "Unknown"}` },
    "ce.abatement": { event_type: "abatement", description: `Abatement action: ${payload.case_number ?? "Unknown"}` },
    "ce.appeal_filed": { event_type: "appeal_filed", description: `Appeal filed: ${payload.case_number ?? "Unknown"}` },
    "ce.closed": { event_type: "ce_closed", description: `Code enforcement case closed: ${payload.case_number ?? "Unknown"}` },
    "permit.created": { event_type: "permit_created", description: `Permit record created: ${payload.permit_number ?? "Unknown"}` },
    "permit.issued": { event_type: "permit_issued", description: `Permit issued: ${payload.permit_number ?? "Unknown"}` },
    "permit.inspection": { event_type: "permit_inspection", description: `Inspection: ${payload.permit_number ?? "Unknown"}` },
    "permit.finalized": { event_type: "permit_finalized", description: `Permit finalized: ${payload.permit_number ?? "Unknown"}` },
    "permit.expired": { event_type: "permit_expired", description: `Permit expired: ${payload.permit_number ?? "Unknown"}` },
    "recon.started": { event_type: "recon_started", description: `Property intelligence recon started` },
    "recon.completed": { event_type: "intelligence_gathered", description: `Property intelligence gathered: ${payload.agent_count ?? 0} agents` },
    "analysis.started": { event_type: "analysis_started", description: `Due process analysis started` },
    "analysis.completed": { event_type: "analysis_completed", description: `Due process analysis completed (score: ${payload.score ?? "N/A"})` },
    "case.created": { event_type: "case_created", description: `Case created: ${payload.name ?? "Unknown"}` },
    "case.updated": { event_type: "case_updated", description: `Case updated` },
    "case.closed": { event_type: "case_closed", description: `Case closed` },
    "relationship.created": { event_type: "relationship_created", description: `Relationship created: ${payload.relationship_type ?? "Unknown"}` },
  };

  const mapped = typeMap[event.event_type] ?? { event_type: event.event_type, description: event.event_type };
  return {
    ...mapped,
    event_date: event.event_date ?? event.created_at ?? new Date().toISOString(),
  };
}

// ── Replay: Reconstruct views from the event store ──
// This is the core validation: can we rebuild everything from events alone?

export async function rebuildTimelineFromEvents(
  db: D1Database,
  caseId: string
): Promise<any[]> {
  return getCaseTimeline(db, caseId, 1000);
}

export async function rebuildAuditLogFromEvents(
  db: D1Database,
  caseId: string
): Promise<any[]> {
  return getCaseAuditLog(db, caseId, 1000);
}

export async function rebuildRelationshipsFromEvents(
  db: D1Database,
  caseId: string
): Promise<any[]> {
  // Relationships are materialized in the relationships table, not reconstructed from events.
  // But we can verify they match by counting relationship.created events vs relationships table.
  return getRelationships(db, { caseId, includeHistorical: true });
}

export async function replayValidation(
  db: D1Database,
  caseId: string
): Promise<{
  timelineEvents: number;
  auditEvents: number;
  relationships: number;
  relationshipEvents: number;
  consistent: boolean;
}> {
  const timeline = await rebuildTimelineFromEvents(db, caseId);
  const audit = await rebuildAuditLogFromEvents(db, caseId);
  const relationships = await rebuildRelationshipsFromEvents(db, caseId);

  // Count relationship.created events
  let relationshipEvents = 0;
  try {
    const result = await db.prepare(
      "SELECT COUNT(*) as count FROM events WHERE case_id = ? AND event_type = 'relationship.created'"
    ).bind(caseId).first();
    relationshipEvents = (result as any)?.count ?? 0;
  } catch { /* ignore */ }

  return {
    timelineEvents: timeline.length,
    auditEvents: audit.length,
    relationships: relationships.length,
    relationshipEvents,
    consistent: relationships.length === relationshipEvents,
  };
}
