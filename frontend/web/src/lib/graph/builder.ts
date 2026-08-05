/**
 * Graph Builder — Phase 2.1 + 2.2
 *
 * Queries D1 tables and constructs domain-shaped graph responses.
 * This is the ONLY module that touches the database for graph data.
 *
 * Derived edges: computed from table joins (case_property, has_evidence, etc.)
 *   — these are facts, not claims. No provenance needed.
 *
 * Semantic edges: from the relationships table (supported_by, mandated_by, etc.)
 *   — these are claims. Each carries provenance: who created it, when,
 *   confidence, and supporting evidence.
 */

import type {
  CaseGraph,
  GraphNode,
  GraphEdge,
  EdgeProvenance,
  CaseTimeline,
  TimelineEntry,
  EntityRelationships,
  RelationshipEdge,
  IncomingEdge,
  EntityHistory,
  HistoryEntry,
  CaseSummary,
  RiskIndicator,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function derivedProvenance(): EdgeProvenance {
  return { source: "derived" };
}

function semanticProvenance(row: Record<string, unknown>): EdgeProvenance {
  const evidenceIdsRaw = row.evidence_ids as string | null;
  return {
    source: "relationship_table",
    created_by: (row.created_by as string) || null,
    created_by_type: (row.created_by_type as string) || "system",
    created_at: (row.created_at as string) || null,
    confidence: row.confidence != null ? (row.confidence as number) : null,
    evidence_ids: evidenceIdsRaw ? JSON.parse(evidenceIdsRaw) : null,
    notes: (row.notes as string) || null,
  };
}

// ── Case Graph ────────────────────────────────────────────────────────────────

export async function buildCaseGraph(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<CaseGraph | null> {
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
  const propertyId = project.property_id as string;
  const caseId = project.id as string;

  // Property node
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
    id: caseId,
    label: (project.name as string) || "Untitled Case",
    data: { status: project.status, case_type: project.case_type },
  });

  edges.push({
    source: caseId,
    target: propertyId,
    type: "case_property",
    type_label: "Property",
    provenance: derivedProvenance(),
  });

  // Evidence
  const evidence = await db
    .prepare(
      `SELECT id, title, doc_type, status, source, created_at, withdrawn
       FROM evidence WHERE project_id = ? AND organization_id = ?
       ORDER BY created_at DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const evi of evidence.results ?? []) {
    const r = evi as Record<string, unknown>;
    nodes.push({
      type: "evidence",
      id: r.id as string,
      label: (r.title as string) || "Untitled Evidence",
      data: {
        doc_type: r.doc_type,
        status: r.status,
        source: r.source,
        withdrawn: r.withdrawn === 1,
      },
    });
    edges.push({
      source: caseId,
      target: r.id as string,
      type: "has_evidence",
      type_label: "Evidence",
      provenance: derivedProvenance(),
    });
  }

  // Findings
  const findings = await db
    .prepare(
      `SELECT id, rule, rule_name, severity, status, detail, evidence_id,
              generated_by_agent, agent_version
       FROM due_process_findings WHERE project_id = ? AND organization_id = ?
       ORDER BY severity DESC, created_at DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const fnd of findings.results ?? []) {
    const r = fnd as Record<string, unknown>;
    nodes.push({
      type: "finding",
      id: r.id as string,
      label: (r.rule_name as string) || (r.rule as string) || "Finding",
      data: {
        severity: r.severity,
        status: r.status,
        detail: r.detail,
        generated_by_agent: r.generated_by_agent,
        agent_version: r.agent_version,
      },
    });
    edges.push({
      source: caseId,
      target: r.id as string,
      type: "has_finding",
      type_label: "Finding",
      provenance: derivedProvenance(),
    });
    if (r.evidence_id) {
      edges.push({
        source: r.id as string,
        target: r.evidence_id as string,
        type: "supported_by",
        type_label: "Supported By",
        provenance: derivedProvenance(),
      });
    }
  }

  // Permits
  const permits = await db
    .prepare(
      `SELECT id, permit_number, permit_type, permit_status, issued_date, expired_date
       FROM building_permits WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const pmt of permits.results ?? []) {
    const r = pmt as Record<string, unknown>;
    nodes.push({
      type: "permit",
      id: r.id as string,
      label: (r.permit_number as string) || (r.permit_type as string) || "Permit",
      data: {
        permit_type: r.permit_type,
        permit_status: r.permit_status,
        issued_date: r.issued_date,
        expired_date: r.expired_date,
      },
    });
    edges.push({
      source: propertyId,
      target: r.id as string,
      type: "has_permit",
      type_label: "Permit",
      provenance: derivedProvenance(),
    });
  }

  // Code Enforcement Cases
  const ceCases = await db
    .prepare(
      `SELECT id, case_number, violation_type, severity, status,
              notice_served_date, compliance_deadline, hearing_date
       FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const ce of ceCases.results ?? []) {
    const r = ce as Record<string, unknown>;
    nodes.push({
      type: "ce_case",
      id: r.id as string,
      label: (r.case_number as string) || (r.violation_type as string) || "CE Case",
      data: {
        case_number: r.case_number,
        violation_type: r.violation_type,
        severity: r.severity,
        status: r.status,
        notice_served_date: r.notice_served_date,
        compliance_deadline: r.compliance_deadline,
        hearing_date: r.hearing_date,
      },
    });
    edges.push({
      source: propertyId,
      target: r.id as string,
      type: "has_ce_case",
      type_label: "CE Case",
      provenance: derivedProvenance(),
    });
  }

  // Recorder records
  const records = await db
    .prepare(
      `SELECT id, document_number, document_type, recording_date, parties
       FROM recorder_records WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .all();

  for (const rec of records.results ?? []) {
    const r = rec as Record<string, unknown>;
    nodes.push({
      type: "event",
      id: r.id as string,
      label: (r.document_type as string) || "Recorded Document",
      data: {
        document_number: r.document_number,
        document_type: r.document_type,
        recording_date: r.recording_date,
        parties: r.parties,
      },
    });
    edges.push({
      source: propertyId,
      target: r.id as string,
      type: "has_recorder",
      type_label: "Recorded",
      provenance: derivedProvenance(),
    });
  }

  // Semantic relationships from the relationships table (with provenance)
  const rels = await db
    .prepare(
      `SELECT r.source_type, r.source_id, r.target_type, r.target_id,
              r.relationship_type, r.valid_from, r.valid_to,
              r.created_by, r.created_by_type, r.confidence,
              r.evidence_ids, r.notes, r.created_at,
              rt.label AS type_label
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.case_id = ?`,
    )
    .bind(projectId)
    .all();

  for (const rel of rels.results ?? []) {
    const r = rel as Record<string, unknown>;
    const sourceExists = nodes.some((n) => n.id === r.source_id);
    const targetExists = nodes.some((n) => n.id === r.target_id);
    if (sourceExists && targetExists) {
      edges.push({
        source: r.source_id as string,
        target: r.target_id as string,
        type: r.relationship_type as string,
        type_label: (r.type_label as string) || r.relationship_type as string,
        valid_from: (r.valid_from as string) || null,
        valid_to: (r.valid_to as string) || null,
        provenance: semanticProvenance(r),
      });
    }
  }

  return {
    case: {
      id: caseId,
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

// ── Case Timeline ────────────────────────────────────────────────────────────

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
      `SELECT id, event_date, event_type, description, severity,
              organization_id, actor_type, actor_id, actor_organization_id,
              resource_organization_id, agent_version, evidence_id
       FROM timeline_events
       WHERE project_id = ? AND organization_id = ?
       ORDER BY event_date DESC`,
    )
    .bind(projectId, organizationId)
    .all();

  const entries: TimelineEntry[] = (events.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      date: r.event_date as string,
      type: r.event_type as string,
      type_label: EVENT_TYPE_LABELS[r.event_type as string] || (r.event_type as string),
      description: (r.description as string) || "",
      severity: (r.severity as string) || "info",
      actor: {
        type: (r.actor_type as string) || "system",
        id: (r.actor_id as string) || "system",
        organization_id: (r.actor_organization_id as string) || null,
      },
      resource_organization_id: (r.resource_organization_id as string) || null,
      evidence_id: (r.evidence_id as string) || null,
      agent_version: (r.agent_version as string) || null,
      entity_type: null,
      entity_id: null,
    };
  });

  return { case_id: projectId, events: entries };
}

// ── Entity Relationships ──────────────────────────────────────────────────────

export async function buildEntityRelationships(
  db: D1Database,
  entityType: string,
  entityId: string,
  caseId: string,
): Promise<EntityRelationships | null> {
  const outgoing = await db
    .prepare(
      `SELECT r.relationship_type, rt.label AS type_label,
              r.target_type, r.target_id, r.valid_from, r.valid_to,
              r.created_by, r.created_by_type, r.confidence,
              r.evidence_ids, r.notes, r.created_at
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.source_type = ? AND r.source_id = ? AND r.case_id = ?`,
    )
    .bind(entityType, entityId, caseId)
    .all();

  const incoming = await db
    .prepare(
      `SELECT r.relationship_type, rt.label AS type_label,
              r.source_type, r.source_id,
              r.created_by, r.created_by_type, r.confidence,
              r.evidence_ids, r.notes, r.created_at
       FROM relationships r
       LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
       WHERE r.target_type = ? AND r.target_id = ? AND r.case_id = ?`,
    )
    .bind(entityType, entityId, caseId)
    .all();

  return {
    entity: { type: entityType, id: entityId },
    outgoing: (outgoing.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        type: r.relationship_type as string,
        type_label: (r.type_label as string) || r.relationship_type as string,
        target_type: r.target_type as string,
        target_id: r.target_id as string,
        target_label: r.target_id as string,
        valid_from: (r.valid_from as string) || null,
        valid_to: (r.valid_to as string) || null,
        provenance: semanticProvenance(r),
      };
    }),
    incoming: (incoming.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        type: r.relationship_type as string,
        type_label: (r.type_label as string) || r.relationship_type as string,
        source_type: r.source_type as string,
        source_id: r.source_id as string,
        source_label: r.source_id as string,
        provenance: semanticProvenance(r),
      };
    }),
  };
}

// ── Entity History ───────────────────────────────────────────────────────────

export async function buildEntityHistory(
  db: D1Database,
  entityType: string,
  entityId: string,
  caseId: string,
): Promise<EntityHistory | null> {
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
    history: (history.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        date: r.created_at as string,
        type: r.event_type as string,
        type_label: EVENT_TYPE_LABELS[r.event_type as string] || (r.event_type as string),
        actor_type: (r.actor_type as string) || "system",
        actor_id: (r.actor_id as string) || "system",
        actor_name: (r.actor_name as string) || "",
        severity: (r.severity as string) || "info",
        title: (r.title as string) || null,
        description: (r.description as string) || null,
      };
    }),
  };
}

// ── Case Summary (Phase 2.2) ──────────────────────────────────────────────────

export async function buildCaseSummary(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<CaseSummary | null> {
  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.case_type, p.status,
              pr.id AS property_id, pr.apn, pr.address, pr.city, pr.zoning, pr.acres
       FROM projects p
       JOIN properties pr ON p.property_id = pr.id
       WHERE p.id = ? AND p.organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .first();

  if (!project) return null;
  const p = project as Record<string, unknown>;

  // Counts
  const evidenceCount = await db
    .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, organizationId)
    .first();

  const findings = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical
       FROM due_process_findings WHERE project_id = ? AND organization_id = ?`,
    )
    .bind(projectId, organizationId)
    .first();

  const timelineCount = await db
    .prepare("SELECT COUNT(*) AS n FROM timeline_events WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, organizationId)
    .first();

  // Last action
  const lastAction = await db
    .prepare(
      `SELECT event_date, event_type, description
       FROM timeline_events WHERE project_id = ? AND organization_id = ?
       ORDER BY event_date DESC LIMIT 1`,
    )
    .bind(projectId, organizationId)
    .first();

  // Risk indicators — computed from findings and CE case status
  const riskIndicators: RiskIndicator[] = [];

  const f = findings as Record<string, unknown> | null;
  const openCount = (f?.open_count as number) || 0;
  const criticalCount = (f?.critical as number) || 0;

  if (criticalCount > 0) {
    riskIndicators.push({
      label: "Critical Findings",
      severity: "critical",
      detail: `${criticalCount} critical due-process finding(s) open`,
    });
  }

  if (openCount > 0) {
    riskIndicators.push({
      label: "Open Findings",
      severity: "warning",
      detail: `${openCount} open due-process finding(s)`,
    });
  }

  // Check for overdue compliance deadlines
  const overdue = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM code_enforcement_cases
       WHERE project_id = ? AND organization_id = ?
       AND compliance_deadline IS NOT NULL
       AND compliance_deadline < date('now')
       AND status = 'open'`,
    )
    .bind(projectId, organizationId)
    .first();

  if ((overdue?.n as number) > 0) {
    riskIndicators.push({
      label: "Overdue Compliance",
      severity: "critical",
      detail: `${overdue?.n} code enforcement case(s) past compliance deadline`,
    });
  }

  // Check for expired permits
  const expiredPermits = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM building_permits
       WHERE project_id = ? AND organization_id = ?
       AND expired_date IS NOT NULL
       AND expired_date < date('now')
       AND permit_status NOT IN ('finalized', 'cancelled')`,
    )
    .bind(projectId, organizationId)
    .first();

  if ((expiredPermits?.n as number) > 0) {
    riskIndicators.push({
      label: "Expired Permits",
      severity: "warning",
      detail: `${expiredPermits?.n} expired permit(s)`,
    });
  }

  if (riskIndicators.length === 0) {
    riskIndicators.push({
      label: "No Active Risks",
      severity: "info",
      detail: "No critical findings, overdue deadlines, or expired permits",
    });
  }

  const la = lastAction as Record<string, unknown> | null;
  return {
    case_id: p.id as string,
    case_name: (p.name as string) || "Untitled Case",
    status: p.status as string,
    property: {
      apn: (p.apn as string) || "",
      address: (p.address as string) || "",
      city: (p.city as string) || "",
      zoning: (p.zoning as string) || "",
      acres: (p.acres as number) || null,
    },
    jurisdiction: "Humboldt County",
    case_type: p.case_type as string,
    open_findings_count: openCount,
    critical_findings_count: criticalCount,
    evidence_count: (evidenceCount?.n as number) || 0,
    timeline_event_count: (timelineCount?.n as number) || 0,
    last_action: {
      date: (la?.event_date as string) || null,
      type: (la?.event_type as string) || null,
      type_label: la?.event_type ? EVENT_TYPE_LABELS[la.event_type as string] || (la.event_type as string) : null,
      description: (la?.description as string) || null,
    },
    risk_indicators: riskIndicators,
  };
}
