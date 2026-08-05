/**
 * Graph Builder — Phase 2.1 + 2.2 + 2.3
 *
 * Queries D1 and constructs domain-shaped graph responses.
 * The ONLY module that touches the database for graph data.
 *
 * Phase 2.3 additions:
 * - Relevance scoring on nodes
 * - Investigation Focus (structured observations, procedural checks, missing info)
 * - "Why am I seeing this?" node explanations
 * - Edge lifecycle (pending_review / accepted / rejected / superseded)
 */

import type {
  CaseGraph, GraphNode, GraphEdge, EdgeProvenance, EdgeStatus,
  CaseTimeline, TimelineEntry,
  EntityRelationships, RelationshipEdge, IncomingEdge,
  EntityHistory, HistoryEntry,
  CaseSummary, RiskIndicator,
  InvestigationFocus, Observation, ProceduralCheck, MissingInformation, SupportingEvidence,
  NodeExplanation, NodeReason,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function derivedProvenance(): EdgeProvenance {
  return { source: "derived", status: "accepted" };
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
    status: (row.status as EdgeStatus) || "pending_review",
    reviewed_by: (row.reviewed_by as string) || null,
    reviewed_by_type: (row.reviewed_by_type as string) || null,
    reviewed_at: (row.reviewed_at as string) || null,
    review_reason: (row.review_reason as string) || null,
    superseded_by: (row.superseded_by as string) || null,
  };
}

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

// ── Relevance Scoring ────────────────────────────────────────────────────────
//
// Scores nodes 0-100. Higher = more relevant to the investigation.
// Factors:
//   +30  direct case relationship (case node, property node)
//   +20  open finding
//   +15  critical evidence (processed, not withdrawn)
//   +10  recent timeline event (last 30 days)
//   +10  high-confidence semantic edge connected
//   +5   per connected edge

function computeRelevance(
  node: GraphNode,
  edges: GraphEdge[],
  timelineDates: Map<string, string>,
): number {
  let score = 0;

  // Direct case relationship
  if (node.type === "case" || node.type === "property") score += 30;

  // Open finding
  if (node.type === "finding") {
    const status = node.data.status as string;
    if (status === "open") score += 20;
    const severity = node.data.severity as string;
    if (severity === "critical") score += 10;
  }

  // Evidence quality
  if (node.type === "evidence") {
    const status = node.data.status as string;
    const withdrawn = node.data.withdrawn as boolean;
    if (!withdrawn && status === "processed") score += 15;
    else if (!withdrawn) score += 8;
  }

  // Recent timeline event
  const eventDate = timelineDates.get(node.id);
  if (eventDate) {
    const daysSince = (Date.now() - new Date(eventDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) score += 10;
    else if (daysSince < 90) score += 5;
  }

  // Connected edges
  const connectedEdges = edges.filter(e => e.source === node.id || e.target === node.id);
  score += Math.min(connectedEdges.length * 5, 20);

  // High-confidence semantic edge
  for (const edge of connectedEdges) {
    if (edge.provenance?.source === "relationship_table" && edge.provenance?.confidence != null) {
      if (edge.provenance.confidence >= 0.8) score += 10;
      break;
    }
  }

  return Math.min(score, 100);
}

// ── Case Graph ────────────────────────────────────────────────────────────────

export async function buildCaseGraph(
  db: D1Database, projectId: string, organizationId: string,
): Promise<CaseGraph | null> {
  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.case_type, p.status, p.organization_id,
              pr.id AS property_id, pr.apn, pr.address, pr.city, pr.zoning, pr.acres
       FROM projects p JOIN properties pr ON p.property_id = pr.id
       WHERE p.id = ? AND p.organization_id = ?`,
    ).bind(projectId, organizationId).first();
  if (!project) return null;
  const p = project as Record<string, unknown>;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const propertyId = p.property_id as string;
  const caseId = p.id as string;

  // Property + Case nodes
  nodes.push({
    type: "property", id: propertyId,
    label: (p.address as string) || (p.apn as string) || "Property",
    data: { apn: p.apn, address: p.address, city: p.city, zoning: p.zoning, acres: p.acres },
  });
  nodes.push({
    type: "case", id: caseId,
    label: (p.name as string) || "Untitled Case",
    data: { status: p.status, case_type: p.case_type },
  });
  edges.push({ source: caseId, target: propertyId, type: "case_property", type_label: "Property", provenance: derivedProvenance() });

  // Evidence
  const evidence = await db.prepare(
    `SELECT id, title, doc_type, status, source, created_at, withdrawn
     FROM evidence WHERE project_id = ? AND organization_id = ? ORDER BY created_at DESC`,
  ).bind(projectId, organizationId).all();

  for (const evi of evidence.results ?? []) {
    const r = evi as Record<string, unknown>;
    nodes.push({ type: "evidence", id: r.id as string, label: (r.title as string) || "Untitled", data: { doc_type: r.doc_type, status: r.status, source: r.source, withdrawn: r.withdrawn === 1 } });
    edges.push({ source: caseId, target: r.id as string, type: "has_evidence", type_label: "Evidence", provenance: derivedProvenance() });
  }

  // Findings
  const findings = await db.prepare(
    `SELECT id, rule, rule_name, severity, status, detail, evidence_id, generated_by_agent, agent_version
     FROM due_process_findings WHERE project_id = ? AND organization_id = ? ORDER BY severity DESC, created_at DESC`,
  ).bind(projectId, organizationId).all();

  for (const fnd of findings.results ?? []) {
    const r = fnd as Record<string, unknown>;
    nodes.push({ type: "finding", id: r.id as string, label: (r.rule_name as string) || (r.rule as string) || "Finding", data: { severity: r.severity, status: r.status, detail: r.detail, generated_by_agent: r.generated_by_agent, agent_version: r.agent_version } });
    edges.push({ source: caseId, target: r.id as string, type: "has_finding", type_label: "Finding", provenance: derivedProvenance() });
    if (r.evidence_id) edges.push({ source: r.id as string, target: r.evidence_id as string, type: "supported_by", type_label: "Supported By", provenance: derivedProvenance() });
  }

  // Permits
  const permits = await db.prepare(
    `SELECT id, permit_number, permit_type, permit_status, issued_date, expired_date
     FROM building_permits WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  for (const pmt of permits.results ?? []) {
    const r = pmt as Record<string, unknown>;
    nodes.push({ type: "permit", id: r.id as string, label: (r.permit_number as string) || (r.permit_type as string) || "Permit", data: { permit_type: r.permit_type, permit_status: r.permit_status, issued_date: r.issued_date, expired_date: r.expired_date } });
    edges.push({ source: propertyId, target: r.id as string, type: "has_permit", type_label: "Permit", provenance: derivedProvenance() });
  }

  // CE Cases
  const ceCases = await db.prepare(
    `SELECT id, case_number, violation_type, severity, status, notice_served_date, compliance_deadline, hearing_date
     FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  for (const ce of ceCases.results ?? []) {
    const r = ce as Record<string, unknown>;
    nodes.push({ type: "ce_case", id: r.id as string, label: (r.case_number as string) || (r.violation_type as string) || "CE Case", data: { case_number: r.case_number, violation_type: r.violation_type, severity: r.severity, status: r.status, notice_served_date: r.notice_served_date, compliance_deadline: r.compliance_deadline, hearing_date: r.hearing_date } });
    edges.push({ source: propertyId, target: r.id as string, type: "has_ce_case", type_label: "CE Case", provenance: derivedProvenance() });
  }

  // Recorder records
  const records = await db.prepare(
    `SELECT id, document_number, document_type, recording_date, parties
     FROM recorder_records WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  for (const rec of records.results ?? []) {
    const r = rec as Record<string, unknown>;
    nodes.push({ type: "event", id: r.id as string, label: (r.document_type as string) || "Recorded Document", data: { document_number: r.document_number, document_type: r.document_type, recording_date: r.recording_date, parties: r.parties } });
    edges.push({ source: propertyId, target: r.id as string, type: "has_recorder", type_label: "Recorded", provenance: derivedProvenance() });
  }

  // Semantic relationships (with lifecycle provenance)
  const rels = await db.prepare(
    `SELECT r.source_type, r.source_id, r.target_type, r.target_id,
            r.relationship_type, r.valid_from, r.valid_to,
            r.created_by, r.created_by_type, r.confidence,
            r.evidence_ids, r.notes, r.created_at,
            r.status, r.reviewed_by, r.reviewed_by_type, r.reviewed_at, r.review_reason, r.superseded_by,
            rt.label AS type_label
     FROM relationships r
     LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
     WHERE r.case_id = ? AND r.status != 'superseded'`,
  ).bind(projectId).all();

  for (const rel of rels.results ?? []) {
    const r = rel as Record<string, unknown>;
    const sourceExists = nodes.some(n => n.id === r.source_id);
    const targetExists = nodes.some(n => n.id === r.target_id);
    if (sourceExists && targetExists) {
      edges.push({
        source: r.source_id as string, target: r.target_id as string,
        type: r.relationship_type as string,
        type_label: (r.type_label as string) || r.relationship_type as string,
        valid_from: (r.valid_from as string) || null, valid_to: (r.valid_to as string) || null,
        provenance: semanticProvenance(r),
      });
    }
  }

  // ── Relevance scoring ──
  // Build a map of node_id → latest timeline date for recency scoring
  const timelineDates = new Map<string, string>();
  const tlEvents = await db.prepare(
    `SELECT event_date, evidence_id FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date DESC`,
  ).bind(projectId, organizationId).all();
  for (const ev of tlEvents.results ?? []) {
    const r = ev as Record<string, unknown>;
    if (r.evidence_id) timelineDates.set(r.evidence_id as string, r.event_date as string);
  }

  for (const node of nodes) {
    node.relevance_score = computeRelevance(node, edges, timelineDates);
  }

  return {
    case: { id: caseId, name: p.name as string, status: p.status as string, property: { id: propertyId, apn: (p.apn as string) || "", address: (p.address as string) || "" } },
    nodes, edges,
  };
}

// ── Case Timeline ────────────────────────────────────────────────────────────

export async function buildCaseTimeline(
  db: D1Database, projectId: string, organizationId: string,
): Promise<CaseTimeline | null> {
  const events = await db.prepare(
    `SELECT id, event_date, event_type, description, severity,
            organization_id, actor_type, actor_id, actor_organization_id,
            resource_organization_id, agent_version, evidence_id
     FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date DESC`,
  ).bind(projectId, organizationId).all();

  const entries: TimelineEntry[] = (events.results ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string, date: r.event_date as string,
      type: r.event_type as string,
      type_label: EVENT_TYPE_LABELS[r.event_type as string] || (r.event_type as string),
      description: (r.description as string) || "",
      severity: ((r.severity as string) || "info") as any,
      actor: { type: (r.actor_type as string) || "system", id: (r.actor_id as string) || "system", organization_id: (r.actor_organization_id as string) || null },
      resource_organization_id: (r.resource_organization_id as string) || null,
      evidence_id: (r.evidence_id as string) || null,
      agent_version: (r.agent_version as string) || null,
      entity_type: null, entity_id: null,
    };
  });

  return { case_id: projectId, events: entries };
}

// ── Entity Relationships ──────────────────────────────────────────────────────

export async function buildEntityRelationships(
  db: D1Database, entityType: string, entityId: string, caseId: string,
): Promise<EntityRelationships | null> {
  const outgoing = await db.prepare(
    `SELECT r.relationship_type, rt.label AS type_label, r.target_type, r.target_id,
            r.valid_from, r.valid_to, r.created_by, r.created_by_type, r.confidence,
            r.evidence_ids, r.notes, r.created_at,
            r.status, r.reviewed_by, r.reviewed_by_type, r.reviewed_at, r.review_reason, r.superseded_by
     FROM relationships r LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
     WHERE r.source_type = ? AND r.source_id = ? AND r.case_id = ? AND r.status != 'superseded'`,
  ).bind(entityType, entityId, caseId).all();

  const incoming = await db.prepare(
    `SELECT r.relationship_type, rt.label AS type_label, r.source_type, r.source_id,
            r.created_by, r.created_by_type, r.confidence, r.evidence_ids, r.notes, r.created_at,
            r.status, r.reviewed_by, r.reviewed_by_type, r.reviewed_at, r.review_reason, r.superseded_by
     FROM relationships r LEFT JOIN relationship_types rt ON rt.code = r.relationship_type
     WHERE r.target_type = ? AND r.target_id = ? AND r.case_id = ? AND r.status != 'superseded'`,
  ).bind(entityType, entityId, caseId).all();

  return {
    entity: { type: entityType, id: entityId },
    outgoing: (outgoing.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        type: r.relationship_type as string, type_label: (r.type_label as string) || r.relationship_type as string,
        target_type: r.target_type as string, target_id: r.target_id as string, target_label: r.target_id as string,
        valid_from: (r.valid_from as string) || null, valid_to: (r.valid_to as string) || null,
        provenance: semanticProvenance(r),
      };
    }),
    incoming: (incoming.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        type: r.relationship_type as string, type_label: (r.type_label as string) || r.relationship_type as string,
        source_type: r.source_type as string, source_id: r.source_id as string, source_label: r.source_id as string,
        provenance: semanticProvenance(r),
      };
    }),
  };
}

// ── Entity History ───────────────────────────────────────────────────────────

export async function buildEntityHistory(
  db: D1Database, entityType: string, entityId: string, caseId: string,
): Promise<EntityHistory | null> {
  const history = await db.prepare(
    `SELECT id, created_at, event_type, actor_type, actor_id, actor_name, severity, title, description
     FROM events WHERE entity_type = ? AND entity_id = ? AND case_id = ? ORDER BY created_at DESC`,
  ).bind(entityType, entityId, caseId).all();

  return {
    entity: { type: entityType, id: entityId },
    history: (history.results ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string, date: r.created_at as string, type: r.event_type as string,
        type_label: EVENT_TYPE_LABELS[r.event_type as string] || (r.event_type as string),
        actor_type: (r.actor_type as string) || "system", actor_id: (r.actor_id as string) || "system",
        actor_name: (r.actor_name as string) || "", severity: ((r.severity as string) || "info") as any,
        title: (r.title as string) || null, description: (r.description as string) || null,
      };
    }),
  };
}

// ── Case Summary ──────────────────────────────────────────────────────────────

export async function buildCaseSummary(
  db: D1Database, projectId: string, organizationId: string,
): Promise<CaseSummary | null> {
  const project = await db.prepare(
    `SELECT p.id, p.name, p.case_type, p.status, pr.id AS property_id, pr.apn, pr.address, pr.city, pr.zoning, pr.acres
     FROM projects p JOIN properties pr ON p.property_id = pr.id
     WHERE p.id = ? AND p.organization_id = ?`,
  ).bind(projectId, organizationId).first();
  if (!project) return null;
  const p = project as Record<string, unknown>;

  const evidenceCount = await db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND organization_id = ?").bind(projectId, organizationId).first();
  const findings = await db.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
            SUM(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical
     FROM due_process_findings WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).first();
  const timelineCount = await db.prepare("SELECT COUNT(*) AS n FROM timeline_events WHERE project_id = ? AND organization_id = ?").bind(projectId, organizationId).first();
  const lastAction = await db.prepare(
    "SELECT event_date, event_type, description FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date DESC LIMIT 1",
  ).bind(projectId, organizationId).first();

  const riskIndicators: RiskIndicator[] = [];
  const f = findings as Record<string, unknown> | null;
  const openCount = (f?.open_count as number) || 0;
  const criticalCount = (f?.critical as number) || 0;

  if (criticalCount > 0) riskIndicators.push({ label: "Critical Findings", severity: "critical", detail: `${criticalCount} critical due-process finding(s) open` });
  if (openCount > 0) riskIndicators.push({ label: "Open Findings", severity: "warning", detail: `${openCount} open due-process finding(s)` });

  const overdue = await db.prepare(
    `SELECT COUNT(*) AS n FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ? AND compliance_deadline IS NOT NULL AND compliance_deadline < date('now') AND status = 'open'`,
  ).bind(projectId, organizationId).first();
  if ((overdue?.n as number) > 0) riskIndicators.push({ label: "Overdue Compliance", severity: "critical", detail: `${overdue?.n} case(s) past compliance deadline` });

  const expiredPermits = await db.prepare(
    `SELECT COUNT(*) AS n FROM building_permits WHERE project_id = ? AND organization_id = ? AND expired_date IS NOT NULL AND expired_date < date('now') AND permit_status NOT IN ('finalized', 'cancelled')`,
  ).bind(projectId, organizationId).first();
  if ((expiredPermits?.n as number) > 0) riskIndicators.push({ label: "Expired Permits", severity: "warning", detail: `${expiredPermits?.n} expired permit(s)` });

  if (riskIndicators.length === 0) riskIndicators.push({ label: "No Active Risks", severity: "info", detail: "No critical findings, overdue deadlines, or expired permits" });

  const la = lastAction as Record<string, unknown> | null;
  return {
    case_id: p.id as string, case_name: (p.name as string) || "Untitled Case", status: p.status as string,
    property: { apn: (p.apn as string) || "", address: (p.address as string) || "", city: (p.city as string) || "", zoning: (p.zoning as string) || "", acres: (p.acres as number) || null },
    jurisdiction: "Humboldt County", case_type: p.case_type as string,
    open_findings_count: openCount, critical_findings_count: criticalCount,
    evidence_count: (evidenceCount?.n as number) || 0, timeline_event_count: (timelineCount?.n as number) || 0,
    last_action: { date: (la?.event_date as string) || null, type: (la?.event_type as string) || null, type_label: la?.event_type ? EVENT_TYPE_LABELS[la.event_type as string] || (la.event_type as string) : null, description: (la?.description as string) || null },
    risk_indicators: riskIndicators,
  };
}

// ── Investigation Focus (Phase 2.3) ───────────────────────────────────────────
//
// Structured analysis — observations, procedural checks, missing info.
// NOT violations. The neutrality contract stays intact.

export async function buildInvestigationFocus(
  db: D1Database, projectId: string, organizationId: string,
): Promise<InvestigationFocus | null> {
  // Load all case data for analysis
  const timeline = await db.prepare(
    `SELECT id, event_date, event_type, description, evidence_id
     FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date ASC`,
  ).bind(projectId, organizationId).all();

  const ceCases = await db.prepare(
    `SELECT id, case_number, violation_type, status, notice_served_date, notice_method,
            notice_period_days, compliance_deadline, hearing_date, hearing_type
     FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  const permits = await db.prepare(
    `SELECT id, permit_number, permit_type, permit_status, issued_date, expired_date, finalized_date
     FROM building_permits WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  const findings = await db.prepare(
    `SELECT id, rule, rule_name, severity, status, detail, evidence_id
     FROM due_process_findings WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  const evidence = await db.prepare(
    `SELECT id, title, doc_type, status, source
     FROM evidence WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  const observations: Observation[] = [];
  const proceduralChecks: ProceduralCheck[] = [];
  const missingInfo: MissingInformation[] = [];
  const supportingEvidence: SupportingEvidence[] = [];

  // ── Timeline gap detection ──
  const events = (timeline.results ?? []).map(r => r as Record<string, unknown>);
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    const prevDate = new Date(prev.event_date as string);
    const currDate = new Date(curr.event_date as string);
    const gapDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    if (gapDays > 90) {
      observations.push({
        type: "timeline_gap",
        description: `${Math.round(gapDays)}-day gap between "${(prev.event_type as string) || "event"}" and "${(curr.event_type as string) || "event"}"`,
        date: curr.event_date as string,
        severity: "info",
      });
    }
  }

  // ── CE case procedural checks ──
  for (const ce of ceCases.results ?? []) {
    const r = ce as Record<string, unknown>;

    // Check: notice served before hearing
    const noticeDate = r.notice_served_date as string | null;
    const hearingDate = r.hearing_date as string | null;
    if (hearingDate && noticeDate) {
      const noticeDays = (new Date(hearingDate).getTime() - new Date(noticeDate).getTime()) / (1000 * 60 * 60 * 24);
      const requiredDays = (r.notice_period_days as number) || 10;
      if (noticeDays < requiredDays) {
        observations.push({
          type: "sequence_anomaly",
          description: `Hearing on ${hearingDate} occurred ${Math.round(noticeDays)} days after notice, required minimum is ${requiredDays} days`,
          date: hearingDate,
          severity: "critical",
          related_entity_type: "ce_case",
          related_entity_id: r.id as string,
        });
      }
      proceduralChecks.push({
        requirement: "Notice period before hearing",
        status: noticeDays >= requiredDays ? "met" : "missing",
        evidence_ids: [],
        detail: `${Math.round(noticeDays)} days between notice (${noticeDate}) and hearing (${hearingDate}), required: ${requiredDays}`,
      });
    } else if (hearingDate && !noticeDate) {
      observations.push({
        type: "missing_notice",
        description: `Hearing scheduled on ${hearingDate} but no notice service date recorded`,
        date: hearingDate,
        severity: "warning",
        related_entity_type: "ce_case",
        related_entity_id: r.id as string,
      });
      proceduralChecks.push({
        requirement: "Notice served before hearing",
        status: "unclear",
        evidence_ids: [],
        detail: `Hearing on ${hearingDate} but no notice date in record`,
      });
      missingInfo.push({
        description: "Proof of notice service for code enforcement case " + (r.case_number as string || ""),
        type: "document",
        importance: "critical",
      });
    }

    // Check: compliance deadline passed
    const complianceDeadline = r.compliance_deadline as string | null;
    if (complianceDeadline && r.status === "open") {
      const deadline = new Date(complianceDeadline);
      if (deadline < new Date()) {
        observations.push({
          type: "deadline_passed",
          description: `Compliance deadline (${complianceDeadline}) has passed for CE case ${r.case_number as string || ""}`,
          date: complianceDeadline,
          severity: "warning",
          related_entity_type: "ce_case",
          related_entity_id: r.id as string,
        });
      }
      proceduralChecks.push({
        requirement: "Compliance within deadline",
        status: deadline > new Date() ? "met" : "missing",
        evidence_ids: [],
        detail: `Deadline: ${complianceDeadline}, status: ${r.status as string}`,
      });
    }
  }

  // ── Permit procedural checks ──
  for (const pmt of permits.results ?? []) {
    const r = pmt as Record<string, unknown>;
    if (r.permit_status === "issued" && !r.finalized_date && r.expired_date) {
      const expDate = new Date(r.expired_date as string);
      if (expDate < new Date()) {
        observations.push({
          type: "deadline_passed",
          description: `Permit ${r.permit_number as string || ""} expired ${r.expired_date as string} without finalization`,
          date: r.expired_date as string,
          severity: "info",
          related_entity_type: "permit",
          related_entity_id: r.id as string,
        });
      }
    }
  }

  // ── Authority gap detection ──
  // Check if findings reference statutes/authorities (via relationships)
  const semanticRels = await db.prepare(
    `SELECT COUNT(*) AS n FROM relationships WHERE case_id = ? AND status != 'superseded'`,
  ).bind(projectId).first();
  if ((semanticRels?.n as number) === 0 && ((findings as any)?.total ?? 0) as number > 0) {
    observations.push({
      type: "authority_gap",
      description: "Findings exist but no authority/statute relationships have been mapped. The legal basis for findings is not yet documented.",
      severity: "warning",
    });
    missingInfo.push({
      description: "Statute or ordinance references for due-process findings",
      type: "authority",
      importance: "recommended",
    });
  }

  // ── Evidence gaps ──
  const rawEvidence = (evidence.results ?? []).filter(r => (r as Record<string, unknown>).status === "raw");
  if (rawEvidence.length > 0) {
    observations.push({
      type: "evidence_gap",
      description: `${rawEvidence.length} evidence item(s) have not been processed (still in "raw" status)`,
      severity: "info",
    });
  }

  // ── Supporting evidence summary ──
  for (const evi of evidence.results ?? []) {
    const r = evi as Record<string, unknown>;
    if ((r.status as string) !== "raw") {
      supportingEvidence.push({
        evidence_id: r.id as string,
        evidence_title: (r.title as string) || "Untitled",
        relevance: (r.doc_type as string) || "document",
      });
    }
  }

  // ── Missing information: check for withdrawn evidence ──
  const withdrawn = await db.prepare(
    "SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND organization_id = ? AND withdrawn = 1",
  ).bind(projectId, organizationId).first();
  if ((withdrawn?.n as number) > 0) {
    missingInfo.push({
      description: `${withdrawn?.n} evidence item(s) have been withdrawn — replacement documentation may be needed`,
      type: "document",
      importance: "recommended",
    });
  }

  // ── Agent proposals (accepted only) ──────────────────────────────────────
  // Accepted agent proposals are included in the Investigation Focus response.
  // Pending and rejected proposals are NOT included — they're in the review queue.
  const agentObs = await db.prepare(
    `SELECT observation_type, description, severity, related_entity_type, related_entity_id,
            agent_id, confidence, reasoning_trace
     FROM agent_proposals
     WHERE case_id = ? AND organization_id = ? AND status = 'accepted'
       AND proposal_type = 'observation'
     ORDER BY created_at DESC`,
  ).bind(projectId, organizationId).all();

  for (const obs of agentObs.results ?? []) {
    const r = obs as Record<string, unknown>;
    observations.push({
      type: ((r.observation_type as string) || "evidence_gap") as any,
      description: `[Agent: ${r.agent_id as string}] ${r.description as string}`,
      severity: ((r.severity as string) || "info") as any,
      related_entity_type: (r.related_entity_type as string) || null,
      related_entity_id: (r.related_entity_id as string) || null,
    });
  }

  const agentChecks = await db.prepare(
    `SELECT requirement, check_status, check_detail, agent_id, confidence, reasoning_trace
     FROM agent_proposals
     WHERE case_id = ? AND organization_id = ? AND status = 'accepted'
       AND proposal_type = 'procedural_check'
     ORDER BY created_at DESC`,
  ).bind(projectId, organizationId).all();

  for (const check of agentChecks.results ?? []) {
    const r = check as Record<string, unknown>;
    proceduralChecks.push({
      requirement: (r.requirement as string) || "Agent check",
      status: ((r.check_status as string) || "unclear") as any,
      evidence_ids: [],
      detail: `[Agent: ${r.agent_id as string}] ${r.check_detail as string || ""}`,
    });
  }

  const agentMissing = await db.prepare(
    `SELECT description, info_type, importance, agent_id
     FROM agent_proposals
     WHERE case_id = ? AND organization_id = ? AND status = 'accepted'
       AND proposal_type = 'missing_info'
     ORDER BY created_at DESC`,
  ).bind(projectId, organizationId).all();

  for (const info of agentMissing.results ?? []) {
    const r = info as Record<string, unknown>;
    missingInfo.push({
      description: `[Agent: ${r.agent_id as string}] ${r.description as string}`,
      type: ((r.info_type as string) || "other") as any,
      importance: ((r.importance as string) || "recommended") as any,
    });
  }

  // Count pending agent proposals for the review queue indicator
  const pendingCount = await db.prepare(
    `SELECT COUNT(*) AS n FROM agent_proposals
     WHERE case_id = ? AND organization_id = ? AND status = 'pending'`,
  ).bind(projectId, organizationId).first();

  return {
    case_id: projectId,
    generated_at: new Date().toISOString(),
    observations,
    procedural_checks: proceduralChecks,
    supporting_evidence: supportingEvidence,
    missing_information: missingInfo,
    pending_agent_proposals: (pendingCount?.n as number) || 0,
  };
}

// ── "Why am I seeing this?" Node Explanation (Phase 2.3) ───────────────────────

export async function buildNodeExplanation(
  db: D1Database, projectId: string, nodeId: string, organizationId: string,
): Promise<NodeExplanation | null> {
  // Load the graph to find the node and its edges
  const graph = await buildCaseGraph(db, projectId, organizationId);
  if (!graph) return null;

  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const reasons: NodeReason[] = [];

  // Direct relationships (derived edges)
  const directEdges = graph.edges.filter(e => e.source === nodeId || e.target === nodeId);
  for (const edge of directEdges) {
    const otherId = edge.source === nodeId ? edge.target : edge.source;
    const otherNode = graph.nodes.find(n => n.id === otherId);
    const isSemantic = edge.provenance?.source === "relationship_table";

    reasons.push({
      source: isSemantic ? "semantic_edge" : "direct_relationship",
      description: `Connected to ${otherNode?.label || otherId} (${otherNode?.type || "unknown"}) via ${edge.type_label || edge.type}`,
      edge_type: edge.type,
      edge_provenance: edge.provenance || null,
      confidence: edge.provenance?.confidence ?? null,
      evidence_ids: edge.provenance?.evidence_ids ?? null,
    });
  }

  // Timeline events referencing this node
  const tlEvents = await db.prepare(
    `SELECT id, event_type, event_date, description FROM timeline_events
     WHERE project_id = ? AND organization_id = ? AND evidence_id = ? ORDER BY event_date DESC LIMIT 5`,
  ).bind(projectId, organizationId, nodeId).all();
  for (const ev of tlEvents.results ?? []) {
    const r = ev as Record<string, unknown>;
    reasons.push({
      source: "timeline_event",
      description: `Referenced by timeline event "${EVENT_TYPE_LABELS[r.event_type as string] || (r.event_type as string)}" on ${r.event_date as string}`,
    });
  }

  // Finding references (if this node is evidence referenced by a finding)
  const findingRefs = await db.prepare(
    `SELECT id, rule_name, severity FROM due_process_findings
     WHERE project_id = ? AND organization_id = ? AND evidence_id = ?`,
  ).bind(projectId, organizationId, nodeId).all();
  for (const fnd of findingRefs.results ?? []) {
    const r = fnd as Record<string, unknown>;
    reasons.push({
      source: "finding_reference",
      description: `Referenced by finding "${r.rule_name as string}" (${r.severity as string} severity)`,
    });
  }

  return {
    node_id: nodeId,
    node_type: node.type,
    node_label: node.label,
    reasons,
  };
}
