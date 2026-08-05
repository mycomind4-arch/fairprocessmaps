/**
 * Graph Builder — Phase 2.1
 *
 * Queries D1 tables and constructs domain-shaped graph responses.
 * This is the ONLY module that touches the database for graph data.
 * The API routes call these functions — the frontend never sees SQL.
 */

import type {
  CaseGraph,
  GraphNode,
  GraphEdge,
  CaseTimeline,
  TimelineEntry,
  EntityRelationships,
  RelationshipEdge,
  IncomingEdge,
  EntityHistory,
  HistoryEntry,
} from "./types";

// ── Case Graph ────────────────────────────────────────────────────────────────

export async function buildCaseGraph(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<CaseGraph | null> {
  // 1. Load project + property (org-scoped)
  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.case_type, p.status, p.organization_id,
              pr.id AS property_id, pr.apn, pr.address, pr.city, pr.zoning, pr.acres
       FROM projects p
       JOIN properties pr ON p.property_id = pr.id
       WHERE p.id = ? AND p.organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .first();

  if (!project) return null;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Property node
  const propertyId = project.property_id as string;
  nodes.push({
    type: "property",
    id: propertyId,
    label: (project.address as string) || (project.apn as string) || "Property",
    data: {
      apn: project.apn,
      address: project.address,
      city: project.city,
      zoning: project.zoning,
      acres: project.acres,
    },
  });

  // Case node
  nodes.push({
    type: "case",
    id: project.id as string,
    label: (project.name as string) || "Untitled Case",
    data: {
      status: project.status,
      case_type: project.case_type,
    },
  });

  // Case → Property edge
  edges.push({
    source: project.id as string,
    target: propertyId,
    type: "case_property",
    type_label: "Property",
  });

  // 2. Load evidence (org-scoped)
  const evidence = await db
    .prepare(
      `SELECT id, title, doc_type, status, source, created_at, withdrawn
       FROM evidence
       WHERE project_id = ? AND organization_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const evi of evidence.results ?? []) {
    nodes.push({
      type: "evidence",
      id: evi.id as string,
      label: (evi.title as string) || "Untitled Evidence",
      data: {
        doc_type: evi.doc_type,
        status: evi.status,
        source: evi.source,
        withdrawn: evi.withdrawn === 1,
      },
    });
    edges.push({
      source: projectId,
      target: evi.id as string,
      type: "has_evidence",
      type_label: "Evidence",
    });
  }

  // 3. Load findings (org-scoped)
  const findings = await db
    .prepare(
      `SELECT id, rule, rule_name, severity, status, detail, evidence_id,
              generated_by_agent, agent_version
       FROM due_process_findings
       WHERE project_id = ? AND organization_id = ?
       ORDER BY severity DESC, created_at DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const fnd of findings.results ?? []) {
    nodes.push({
      type: "finding",
      id: fnd.id as string,
      label: (fnd.rule_name as string) || (fnd.rule as string) || "Finding",
      data: {
        severity: fnd.severity,
        status: fnd.status,
        detail: fnd.detail,
        generated_by_agent: fnd.generated_by_agent,
        agent_version: fnd.agent_version,
      },
    });
    edges.push({
      source: projectId,
      target: fnd.id as string,
      type: "has_finding",
      type_label: "Finding",
    });

    // Finding → Evidence edge (if evidence_id present)
    if (fnd.evidence_id) {
      edges.push({
        source: fnd.id as string,
        target: fnd.evidence_id as string,
        type: "supported_by",
        type_label: "Supported By",
      });
    }
  }

  // 4. Load building permits (org-scoped)
  const permits = await db
    .prepare(
      `SELECT id, permit_number, permit_type, permit_status, issued_date, expired_date
       FROM building_permits
       WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const pmt of permits.results ?? []) {
    nodes.push({
      type: "permit",
      id: pmt.id as string,
      label: (pmt.permit_number as string) || (pmt.permit_type as string) || "Permit",
      data: {
        permit_type: pmt.permit_type,
        permit_status: pmt.permit_status,
        issued_date: pmt.issued_date,
        expired_date: pmt.expired_date,
      },
    });
    edges.push({
      source: propertyId,
      target: pmt.id as string,
      type: "has_permit",
      type_label: "Permit",
    });
  }

  // 5. Load code enforcement cases (org-scoped)
  const ceCases = await db
    .prepare(
      `SELECT id, case_number, violation_type, severity, status,
              notice_served_date, compliance_deadline, hearing_date
       FROM code_enforcement_cases
       WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const ce of ceCases.results ?? []) {
    nodes.push({
      type: "ce_case",
      id: ce.id as string,
      label: (ce.case_number as string) || (ce.violation_type as string) || "CE Case",
      data: {
        case_number: ce.case_number,
        violation_type: ce.violation_type,
        severity: ce.severity,
        status: ce.status,
        notice_served_date: ce.notice_served_date,
        compliance_deadline: ce.compliance_deadline,
        hearing_date: ce.hearing_date,
      },
    });
    edges.push({
      source: propertyId,
      target: ce.id as string,
      type: "has_ce_case",
      type_label: "CE Case",
    });
  }

  // 6. Load recorder records (org-scoped)
  const records = await db
    .prepare(
      `SELECT id, document_number, document_type, recording_date, parties
       FROM recorder_records
       WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const rec of records.results ?? []) {
    nodes.push({
      type: "event",
      id: rec.id as string,
      label: (rec.document_type as string) || "Recorded Document",
      data: {
        document_number: rec.document_number,
        document_type: rec.document_type,
        recording_date: rec.recording_date,
        parties: rec.parties,
      },
    });
    edges.push({
      source: propertyId,
      target: rec.id as string,
      type: "has_recorder",
      type_label: "Recorded",
    });
  }

  // 7. Load semantic relationships from the relationships table
  // These are the non-derived relationships (supported_by, mandated_by, issued_by, etc.)
  const rels = await db
    .prepare(
      `SELECT r.source_type, r.source_id, r.target_type, r.target_id,
              r.relationship_type, r.valid_from, r.valid_to,
              rt.label AS type_label
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.case_id = ?`,
    )
    .bind(projectId)
    .all();

  for (const rel of rels.results ?? []) {
    // Only add edge if both nodes already exist in the graph
    const sourceExists = nodes.some((n) => n.id === rel.source_id);
    const targetExists = nodes.some((n) => n.id === rel.target_id);
    if (sourceExists && targetExists) {
      edges.push({
        source: rel.source_id as string,
        target: rel.target_id as string,
        type: rel.relationship_type as string,
        type_label: (rel.type_label as string) || rel.relationship_type as string,
        valid_from: (rel.valid_from as string) || null,
        valid_to: (rel.valid_to as string) || null,
      });
    }
  }

  return {
    case: {
      id: project.id as string,
      name: project.name as string,
      status: project.status as string,
      property: {
        id: propertyId,
        apn: (project.apn as string) || "",
        address: (project.address as string) || "",
      },
    },
    nodes,
    edges,
  };
}

// ── Case Timeline ─────────────────────────────────────────────────────────────

// Event type label lookup (from the event_types catalog seeded in migration 005)
const EVENT_TYPE_LABELS: Record<string, string> = {
  "evidence.uploaded": "Evidence Uploaded",
  "evidence.processed": "Evidence Processed",
  "evidence.flagged": "Evidence Flagged",
  "finding.created": "Finding Created",
  "finding.resolved": "Finding Resolved",
  "ce.case_created": "CE Case Created",
  "ce.notice_served": "Notice Served",
  "ce.hearing_scheduled": "Hearing Scheduled",
  "ce.compliance_deadline": "Compliance Deadline",
  "ce.abatement": "Abatement",
  "ce.appeal_filed": "Appeal Filed",
  "ce.closed": "CE Case Closed",
  "permit.created": "Permit Created",
  "permit.issued": "Permit Issued",
  "permit.inspection": "Inspection",
  "permit.finalized": "Permit Finalized",
  "permit.expired": "Permit Expired",
  "recon.started": "Recon Started",
  "recon.completed": "Recon Completed",
  "analysis.started": "Analysis Started",
  "analysis.completed": "Analysis Completed",
  "case.created": "Case Created",
  "case.updated": "Case Updated",
  "case.closed": "Case Closed",
  "relationship.created": "Relationship Created",
};

export async function buildCaseTimeline(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<CaseTimeline | null> {
  const events = await db
    .prepare(
      `SELECT id, event_date, event_type, description,
              organization_id, actor_type, actor_id, actor_organization_id,
              resource_organization_id, agent_version, evidence_id
       FROM timeline_events
       WHERE project_id = ? AND organization_id = ?
       ORDER BY event_date DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  const entries: TimelineEntry[] = (events.results ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    date: row.event_date as string,
    type: row.event_type as string,
    type_label: EVENT_TYPE_LABELS[row.event_type as string] || (row.event_type as string),
    description: (row.description as string) || "",
    severity: (row.severity as string) || "info",
    actor: {
      type: (row.actor_type as string) || "system",
      id: (row.actor_id as string) || "system",
      organization_id: (row.actor_organization_id as string) || null,
    },
    resource_organization_id: (row.resource_organization_id as string) || null,
    evidence_id: (row.evidence_id as string) || null,
    agent_version: (row.agent_version as string) || null,
    entity_type: null,
    entity_id: null,
  }));

  return {
    case_id: projectId,
    events: entries,
  };
}

// ── Entity Relationships ──────────────────────────────────────────────────────

export async function buildEntityRelationships(
  db: D1Database,
  entityType: string,
  entityId: string,
  caseId: string,
): Promise<EntityRelationships | null> {
  // Outgoing: this entity is the source
  const outgoing = await db
    .prepare(
      `SELECT r.relationship_type, rt.label AS type_label,
              r.target_type, r.target_id, r.valid_from, r.valid_to
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.source_type = ? AND r.source_id = ? AND r.case_id = ?`,
    )
    .bind(entityType, entityId, caseId)
    .all();

  // Incoming: this entity is the target
  const incoming = await db
    .prepare(
      `SELECT r.relationship_type, rt.label AS type_label,
              r.source_type, r.source_id
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.target_type = ? AND r.target_id = ? AND r.case_id = ?`,
    )
    .bind(entityType, entityId, caseId)
    .all();

  return {
    entity: { type: entityType, id: entityId },
    outgoing: (outgoing.results ?? []).map((r: Record<string, unknown>) => ({
      type: r.relationship_type as string,
      type_label: (r.type_label as string) || r.relationship_type as string,
      target_type: r.target_type as string,
      target_id: r.target_id as string,
      target_label: r.target_id as string, // Simplified — could join for label
      valid_from: (r.valid_from as string) || null,
      valid_to: (r.valid_to as string) || null,
    })),
    incoming: (incoming.results ?? []).map((r: Record<string, unknown>) => ({
      type: r.relationship_type as string,
      type_label: (r.type_label as string) || r.relationship_type as string,
      source_type: r.source_type as string,
      source_id: r.source_id as string,
      source_label: r.source_id as string,
    })),
  };
}

// ── Entity History ───────────────────────────────────────────────────────────

export async function buildEntityHistory(
  db: D1Database,
  entityType: string,
  entityId: string,
  caseId: string,
): Promise<EntityHistory | null> {
  // Query the canonical events table (migration 005)
  const history = await db
    .prepare(
      `SELECT id, created_at, event_type, actor_type, actor_id, actor_name,
              severity, title, description
       FROM events
       WHERE entity_type = ? AND entity_id = ? AND case_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(entityType, entityId, caseId)
    .all();

  return {
    entity: { type: entityType, id: entityId },
    history: (history.results ?? []).map((h: Record<string, unknown>) => ({
      id: h.id as string,
      date: h.created_at as string,
      type: h.event_type as string,
      type_label: EVENT_TYPE_LABELS[h.event_type as string] || (h.event_type as string),
      actor_type: (h.actor_type as string) || "system",
      actor_id: (h.actor_id as string) || "system",
      actor_name: (h.actor_name as string) || "",
      severity: (h.severity as string) || "info",
      title: (h.title as string) || null,
      description: (h.description as string) || null,
    })),
  };
}
