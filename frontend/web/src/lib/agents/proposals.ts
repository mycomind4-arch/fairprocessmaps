/**
 * Agent Proposal Manager — Phase 3.1
 *
 * Handles the proposal review lifecycle:
 *   - List proposals (by case, by status, by agent)
 *   - Review proposals (accept/reject/supersede)
 *   - Promote accepted proposals to canonical tables
 *   - Record reviewer feedback
 *
 * Promotion rules:
 *   - relationship_proposal → inserted into relationships with status='pending_review'
 *     (DOUBLE REVIEW: agent proposal accepted → relationship still needs human review)
 *   - observation/procedural_check/missing_info → marked 'accepted' in agent_proposals,
 *     included in Investigation Focus response
 */

import { humanActor, emitAuditEvent, emitCanonicalEvent } from "@/lib/security/events";
import type { AuthUser } from "@/lib/security/types";
import type { AgentProposal, ProposalStatus } from "./types";

// ── List Proposals ──────────────────────────────────────────────────────────

export async function listProposals(
  db: D1Database,
  caseId: string,
  organizationId: string,
  status?: ProposalStatus,
): Promise<AgentProposal[]> {
  let sql = `SELECT * FROM agent_proposals WHERE case_id = ? AND organization_id = ?`;
  const binds: (string | boolean)[] = [caseId, organizationId];
  if (status) {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  sql += ` ORDER BY created_at DESC`;

  const stmt = db.prepare(sql).bind(...binds);
  const result = await stmt.all();
  return (result.results ?? []).map(row => row as unknown as AgentProposal);
}

// ── Review Proposal ─────────────────────────────────────────────────────────
//
// Accept or reject a proposal. On accept:
//   - relationship_proposal → insert into relationships (pending_review)
//   - other types → mark accepted in agent_proposals
// On reject:
//   - Mark rejected with reason. Never deleted.

export async function reviewProposal(
  db: D1Database,
  proposalId: string,
  reviewer: AuthUser,
  decision: "accepted" | "rejected",
  reviewReason: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  // Load proposal
  const proposal = await db.prepare(
    `SELECT * FROM agent_proposals WHERE id = ? AND organization_id = ? AND status = 'pending'`,
  ).bind(proposalId, reviewer.organization_id).first();

  if (!proposal) {
    return { ok: false, reason: "Proposal not found, not in your organization, or already reviewed" };
  }

  const p = proposal as Record<string, unknown>;

  // Update proposal status
  await db.prepare(
    `UPDATE agent_proposals
     SET status = ?, reviewed_by = ?, reviewed_by_type = 'human', reviewed_at = datetime('now'), review_reason = ?
     WHERE id = ?`,
  ).bind(decision, reviewer.id, reviewReason, proposalId).run();

  // Record feedback (evaluation dataset)
  await db.prepare(
    `INSERT INTO agent_feedback
      (id, proposal_id, agent_id, proposal_type, confidence, reviewer_action, reviewer_id, reviewer_role, review_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    crypto.randomUUID(), proposalId,
    p.agent_id as string, p.proposal_type as string, (p.confidence as number) ?? 0,
    decision, reviewer.id, reviewer.role, reviewReason,
  ).run();

  // Emit audit event
  const actor = humanActor(reviewer);
  await emitAuditEvent({
    db,
    actor,
    action: `agent.proposal.${decision}`,
    resourceType: "agent_proposal",
    resourceId: proposalId,
    detail: `Proposal ${proposalId} ${decision}${reviewReason ? `: ${reviewReason}` : ""}`,
  });

  // If accepted and it's a relationship proposal → promote to relationships (DOUBLE REVIEW)
  if (decision === "accepted" && p.proposal_type === "relationship_proposal") {
    const relId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO relationships
        (id, case_id, source_type, source_id, target_type, target_id,
         relationship_type, created_by, created_by_type, confidence,
         evidence_ids, notes, status, created_from_proposal_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, ?, ?, 'pending_review', ?, datetime('now'))`,
    ).bind(
      relId, p.case_id as string,
      p.source_type as string, p.source_id as string,
      p.target_type as string, p.target_id as string,
      p.relationship_type as string,
      p.agent_id as string,
      (p.confidence as number) ?? null,
      (p.evidence_ids as string) || null,
      JSON.stringify({
        agent_version: p.agent_version,
        model_version: p.model_version,
        reasoning_trace: p.reasoning_trace,
      }),
      proposalId,
    ).run();

    // Emit canonical event for the new relationship (still pending_review)
    await emitCanonicalEvent({
      db,
      caseId: p.case_id as string,
      eventType: "relationship.created",
      entityType: "relationship",
      entityId: relId,
      actor,
      title: `Agent-proposed relationship: ${p.relationship_type}`,
      description: `Promoted from agent proposal ${proposalId}. Status: pending_review (requires second human review).`,
      severity: "info",
    });
  }

  // If accepted and it's an observation/check/missing_info → emit canonical event
  if (decision === "accepted" && p.proposal_type !== "relationship_proposal") {
    await emitCanonicalEvent({
      db,
      caseId: p.case_id as string,
      eventType: "agent.proposal.accepted",
      entityType: "agent_proposal",
      entityId: proposalId,
      actor,
      title: `Agent ${p.proposal_type} accepted`,
      description: (p.description as string) || (p.requirement as string) || `Proposal ${proposalId} accepted by ${reviewer.name}`,
      severity: "info",
    });
  }

  return { ok: true };
}

// ── Get Agent Feedback Stats ────────────────────────────────────────────────
//
// Returns acceptance rate and counts for each agent. This is the
// evaluation dataset — shows which agents are performing well.

export async function getAgentFeedbackStats(
  db: D1Database,
  agentId?: string,
): Promise<Array<{ agent_id: string; total: number; accepted: number; rejected: number; acceptance_rate: number }>> {
  const result = await db.prepare(
    `SELECT agent_id,
            COUNT(*) AS total,
            SUM(CASE WHEN reviewer_action = 'accepted' THEN 1 ELSE 0 END) AS accepted,
            SUM(CASE WHEN reviewer_action = 'rejected' THEN 1 ELSE 0 END) AS rejected
     FROM agent_feedback
     ${agentId ? "WHERE agent_id = ?" : ""}
     GROUP BY agent_id`,
  ).bind(agentId ?? "").all();

  return (result.results ?? []).map(r => {
    const row = r as Record<string, unknown>;
    const total = (row.total as number) || 0;
    const accepted = (row.accepted as number) || 0;
    return {
      agent_id: row.agent_id as string,
      total,
      accepted,
      rejected: (row.rejected as number) || 0,
      acceptance_rate: total > 0 ? accepted / total : 0,
    };
  });
}

// ── Get Relationship Lineage ────────────────────────────────────────────────
//
// Traces a relationship back to its source proposal, agent run, and agent.
// Returns the full provenance chain:
//   Relationship → Proposal → Agent Run → Agent Definition
//
// This is the "Why does this relationship exist?" answer.

export interface RelationshipLineage {
  relationship: {
    id: string;
    case_id: string;
    source_type: string;
    source_id: string;
    target_type: string;
    target_id: string;
    relationship_type: string;
    status: string;
    confidence: number | null;
    created_by: string;
    created_by_type: string;
    created_from_proposal_id: string | null;
    created_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_reason: string | null;
  };
  proposal: {
    id: string;
    agent_run_id: string;
    agent_id: string;
    agent_version: string;
    model_version: string | null;
    proposal_type: string;
    confidence: number;
    evidence_ids: string | null;
    reasoning_trace: string | null;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    review_reason: string | null;
  } | null;
  agent_run: {
    id: string;
    agent_definition_id: string;
    input_snapshot_hash: string;
    status: string;
    started_at: string;
    completed_at: string | null;
  } | null;
  agent_definition: {
    id: string;
    name: string;
    agent_type: string;
    version: string;
    description: string | null;
  } | null;
}

export async function getRelationshipLineage(
  db: D1Database,
  relationshipId: string,
  organizationId: string,
): Promise<RelationshipLineage | null> {
  // Load relationship
  const rel = await db.prepare(
    `SELECT * FROM relationships WHERE id = ? AND organization_id = ?`,
  ).bind(relationshipId, organizationId).first();

  if (!rel) return null;
  const r = rel as Record<string, unknown>;

  const lineage: RelationshipLineage = {
    relationship: {
      id: r.id as string,
      case_id: r.case_id as string,
      source_type: r.source_type as string,
      source_id: r.source_id as string,
      target_type: r.target_type as string,
      target_id: r.target_id as string,
      relationship_type: r.relationship_type as string,
      status: r.status as string,
      confidence: r.confidence as number | null,
      created_by: r.created_by as string,
      created_by_type: r.created_by_type as string,
      created_from_proposal_id: r.created_from_proposal_id as string | null,
      created_at: r.created_at as string,
      reviewed_by: r.reviewed_by as string | null,
      reviewed_at: r.reviewed_at as string | null,
      review_reason: r.review_reason as string | null,
    },
    proposal: null,
    agent_run: null,
    agent_definition: null,
  };

  // If relationship came from a proposal, load the proposal
  if (r.created_from_proposal_id) {
    const proposal = await db.prepare(
      `SELECT * FROM agent_proposals WHERE id = ?`,
    ).bind(r.created_from_proposal_id).first();

    if (proposal) {
      const p = proposal as Record<string, unknown>;
      lineage.proposal = {
        id: p.id as string,
        agent_run_id: p.agent_run_id as string,
        agent_id: p.agent_id as string,
        agent_version: p.agent_version as string,
        model_version: p.model_version as string | null,
        proposal_type: p.proposal_type as string,
        confidence: p.confidence as number,
        evidence_ids: p.evidence_ids as string | null,
        reasoning_trace: p.reasoning_trace as string | null,
        status: p.status as string,
        reviewed_by: p.reviewed_by as string | null,
        reviewed_at: p.reviewed_at as string | null,
        review_reason: p.review_reason as string | null,
      };

      // Load the agent run
      if (p.agent_run_id) {
        const run = await db.prepare(
          `SELECT id, agent_definition_id, input_snapshot_hash, status, started_at, completed_at
           FROM agent_runs WHERE id = ?`,
        ).bind(p.agent_run_id).first();

        if (run) {
          const runRow = run as Record<string, unknown>;
          lineage.agent_run = {
            id: runRow.id as string,
            agent_definition_id: runRow.agent_definition_id as string,
            input_snapshot_hash: runRow.input_snapshot_hash as string,
            status: runRow.status as string,
            started_at: runRow.started_at as string,
            completed_at: runRow.completed_at as string | null,
          };

          // Load the agent definition
          if (runRow.agent_definition_id) {
            const def = await db.prepare(
              `SELECT id, name, agent_type, version, description FROM agent_definitions WHERE id = ?`,
            ).bind(runRow.agent_definition_id).first();

            if (def) {
              const defRow = def as Record<string, unknown>;
              lineage.agent_definition = {
                id: defRow.id as string,
                name: defRow.name as string,
                agent_type: defRow.agent_type as string,
                version: defRow.version as string,
                description: defRow.description as string | null,
              };
            }
          }
        }
      }
    }
  }

  return lineage;
}
