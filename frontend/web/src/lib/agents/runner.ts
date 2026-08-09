/**
 * Agent Runner — Phase 3.1
 *
 * Handles agent execution lifecycle:
 *   1. Build read-only input snapshot from case graph
 *   2. Register agent run in agent_runs
 *   3. Execute the agent
 *   4. Persist proposals to agent_proposals
 *   5. Update run status
 *
 * The runner NEVER writes to canonical tables. Proposals go to
 * agent_proposals with status='pending' only.
 */

import { agentActor, emitAuditEvent } from "@/lib/security/events";
import type { AgentInputSnapshot, AgentProposalDraft, AgentResult } from "./types";
import { validateAgentOutput } from "./validator";

// ── Build Input Snapshot ────────────────────────────────────────────────────
//
// Read-only copy of the case graph. No mutations.

export async function buildInputSnapshot(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<AgentInputSnapshot | null> {
  // Case + property
  const project = await db.prepare(
    `SELECT p.id, p.name, p.case_type, pr.id AS property_id, pr.apn, pr.address, pr.city, pr.zoning
     FROM projects p JOIN properties pr ON p.property_id = pr.id
     WHERE p.id = ? AND p.organization_id = ?`,
  ).bind(projectId, organizationId).first();
  if (!project) return null;
  const p = project as Record<string, unknown>;

  // Timeline
  const timeline = await db.prepare(
    `SELECT id, event_date, event_type, description, evidence_id
     FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date ASC`,
  ).bind(projectId, organizationId).all();

  // Evidence
  const evidence = await db.prepare(
    `SELECT id, title, doc_type, status, source FROM evidence WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  // Findings
  const findings = await db.prepare(
    `SELECT id, rule, rule_name, severity, status, detail, evidence_id
     FROM due_process_findings WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  // CE cases
  const ceCases = await db.prepare(
    `SELECT id, case_number, violation_type, status, notice_served_date, notice_period_days,
            compliance_deadline, hearing_date
     FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  // Permits
  const permits = await db.prepare(
    `SELECT id, permit_number, permit_type, permit_status, issued_date, expired_date, finalized_date
     FROM building_permits WHERE project_id = ? AND organization_id = ?`,
  ).bind(projectId, organizationId).all();

  // Relationships (semantic only — derived edges are computed, not stored)
  // Scoped to organization_id for defense-in-depth (C4)
  const relationships = await db.prepare(
    `SELECT id, source_type, source_id, target_type, target_id, relationship_type, status, confidence
     FROM relationships WHERE case_id = ? AND organization_id = ? AND status != 'superseded'`,
  ).bind(projectId, organizationId).all();

  // Statutes — loaded from the statutes table (H1 fix)
  // Previously the statute matcher used embedded hardcoded data, causing drift
  // between the DB seed data and what the agent matched against.
  const statuteRows = await db.prepare(
    `SELECT id, citation, title, jurisdiction, jurisdiction_level, category, summary, keywords, notice_period_days
     FROM statutes`,
  ).all();

  const statutes = (statuteRows.results ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const keywordsRaw = row.keywords as string | null;
    return {
      id: row.id as string,
      citation: row.citation as string,
      title: row.title as string,
      jurisdiction: row.jurisdiction as string,
      jurisdiction_level: row.jurisdiction_level as string,
      category: row.category as string,
      summary: (row.summary as string) || null,
      keywords: keywordsRaw ? JSON.parse(keywordsRaw) : [],
      notice_period_days: (row.notice_period_days as number) ?? null,
    };
  });

  return {
    case_id: p.id as string,
    organization_id: organizationId,
    case_name: p.name as string,
    case_type: p.case_type as string,
    jurisdiction: "Humboldt County",
    property: {
      apn: (p.apn as string) || "",
      address: (p.address as string) || "",
      city: (p.city as string) || "",
      zoning: (p.zoning as string) || "",
    },
    timeline: (timeline.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["timeline"][0]),
    evidence: (evidence.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["evidence"][0]),
    findings: (findings.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["findings"][0]),
    ce_cases: (ceCases.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["ce_cases"][0]),
    permits: (permits.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["permits"][0]),
    relationships: (relationships.results ?? []).map(r => r as Record<string, unknown> as AgentInputSnapshot["relationships"][0]),
    statutes,
  };
}

// ── Compute Snapshot Hash ───────────────────────────────────────────────────
//
// SHA256 of the input snapshot for reproducibility and model comparison.

async function computeSnapshotHash(snapshot: AgentInputSnapshot): Promise<string> {
  const json = JSON.stringify(snapshot);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Run Agent ─────────────────────────────────────────────────────────────────
//
// Full lifecycle: create run → execute → persist proposals → complete run.

export async function runAgent(
  db: D1Database,
  projectId: string,
  organizationId: string,
  agentExecute: (input: AgentInputSnapshot) => Promise<AgentResult>,
  agentMeta: { agent_id: string; agent_version: string; model_version: string | null; agent_type: string },
): Promise<{ run_id: string; proposal_count: number; proposals: { id: string; proposal_type: string }[]; rejected_count: number; rejected_reasons: string[] }> {
  // 1. Build snapshot
  const snapshot = await buildInputSnapshot(db, projectId, organizationId);
  if (!snapshot) throw new Error("Case not found or not accessible");

  // 2. Compute hash
  const snapshotHash = await computeSnapshotHash(snapshot);
  const snapshotJson = JSON.stringify(snapshot);

  // 3. Create run record
  const runId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO agent_runs (id, agent_definition_id, case_id, organization_id,
      agent_id, agent_version, model_version, input_snapshot_hash, input_snapshot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
  ).bind(
    runId, agentMeta.agent_id, projectId, organizationId,
    agentMeta.agent_id, agentMeta.agent_version, agentMeta.model_version,
    snapshotHash, snapshotJson,
  ).run();

  // 4. Emit audit event
  const actor = agentActor(agentMeta.agent_id, organizationId, agentMeta.agent_version);
  await emitAuditEvent({
    db,
    actor,
    action: "agent.run.started",
    resourceType: "agent_run",
    resourceId: runId,
    detail: `Agent ${agentMeta.agent_id} v${agentMeta.agent_version} started on case ${projectId}`,
  });

  // 5. Execute agent
  let result: AgentResult;
  try {
    result = await agentExecute(snapshot);
  } catch (err) {
    // Mark run as failed
    await db.prepare(
      `UPDATE agent_runs SET status = 'failed', completed_at = datetime('now'), error_message = ?
       WHERE id = ?`,
    ).bind(err instanceof Error ? err.message : "Unknown error", runId).run();

    await emitAuditEvent({
      db,
      actor,
      action: "agent.run.failed",
      resourceType: "agent_run",
      resourceId: runId,
      detail: err instanceof Error ? err.message : "Unknown error",
    });

    throw err;
  }

  // 6. Validate agent output — capability + neutrality checks
  const validation = validateAgentOutput(result.proposals, agentMeta.agent_type);

  if (validation.rejected_proposals.length > 0) {
    // Log rejected proposals to audit log
    for (const rejected of validation.rejected_proposals) {
      await emitAuditEvent({
        db,
        actor,
        action: "agent.proposal.rejected_by_validator",
        resourceType: "agent_run",
        resourceId: runId,
        detail: `[${rejected.validator}] ${rejected.reason}`,
      });
    }
  }

  // Only persist proposals that passed validation
  const validProposals = validation.accepted_proposals;

  // 7. Persist proposals
  const persistedProposals: { id: string; proposal_type: string }[] = [];
  for (const draft of validProposals) {
    const proposalId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO agent_proposals
        (id, agent_run_id, case_id, organization_id,
         agent_id, agent_version, model_version,
         proposal_type, source_type, source_id, target_type, target_id, relationship_type,
         observation_type, description, severity, related_entity_type, related_entity_id,
         requirement, check_status, check_detail,
         info_type, importance,
         confidence, evidence_ids, reasoning_trace, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    ).bind(
      proposalId, runId, projectId, organizationId,
      agentMeta.agent_id, agentMeta.agent_version, agentMeta.model_version,
      draft.proposal_type,
      draft.source_type ?? null, draft.source_id ?? null,
      draft.target_type ?? null, draft.target_id ?? null, draft.relationship_type ?? null,
      draft.observation_type ?? null, draft.description ?? null, draft.severity ?? null,
      draft.related_entity_type ?? null, draft.related_entity_id ?? null,
      draft.requirement ?? null, draft.check_status ?? null, draft.check_detail ?? null,
      draft.info_type ?? null, draft.importance ?? null,
      draft.confidence,
      draft.evidence_ids ? JSON.stringify(draft.evidence_ids) : null,
      draft.reasoning_trace,
    ).run();

    persistedProposals.push({ id: proposalId, proposal_type: draft.proposal_type });
  }

  // 8. Complete run
  await db.prepare(
    `UPDATE agent_runs SET status = 'completed', completed_at = datetime('now'), proposal_count = ?
     WHERE id = ?`,
  ).bind(validProposals.length, runId).run();

  // 9. Emit audit event
  await emitAuditEvent({
    db,
    actor,
    action: "agent.run.completed",
    resourceType: "agent_run",
    resourceId: runId,
    detail: `Agent ${agentMeta.agent_id} completed: ${validProposals.length} proposals persisted, ${validation.rejected_proposals.length} rejected by validators`,
  });

  return {
    run_id: runId,
    proposal_count: validProposals.length,
    proposals: persistedProposals,
    rejected_count: validation.rejected_proposals.length,
    rejected_reasons: validation.rejected_proposals.map(r => `[${r.validator}] ${r.reason}`),
  };
}
