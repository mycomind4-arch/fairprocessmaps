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
  return (result.results ?? []).map(row => row as Record<string, unknown> as AgentProposal);
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
         evidence_ids, notes, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent', ?, ?, ?, 'pending_review', datetime('now'))`,
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
        promoted_from_proposal: proposalId,
      }),
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
