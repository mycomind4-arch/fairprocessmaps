/**
 * Agent type definitions — Phase 3.1
 *
 * Agents are provenance-producing participants. Their outputs are proposals,
 * not canonical knowledge. Every proposal enters the review lifecycle.
 */

// ── Agent Definition ────────────────────────────────────────────────────────

export type AgentType =
  | "timeline_anomaly"
  | "statute_matcher"
  | "evidence_extractor"
  | "authority_mapper";

export interface AgentDefinition {
  id: string;                    // e.g. "agent.timeline_anomaly.v1"
  name: string;
  agent_type: AgentType;
  version: string;
  capabilities: string[];
  model_version: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ── Agent Run ───────────────────────────────────────────────────────────────

export type RunStatus = "running" | "completed" | "failed";

export interface AgentRun {
  id: string;
  agent_definition_id: string;
  case_id: string;
  organization_id: string;
  agent_id: string;
  agent_version: string;
  model_version: string | null;
  input_snapshot_hash: string | null;
  started_at: string;
  completed_at: string | null;
  status: RunStatus;
  proposal_count: number;
  error_message: string | null;
}

// ── Agent Proposal ──────────────────────────────────────────────────────────

export type ProposalType =
  | "relationship_proposal"
  | "observation"
  | "procedural_check"
  | "missing_info";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "superseded";

export type ObservationType =
  | "timeline_gap"
  | "sequence_anomaly"
  | "missing_notice"
  | "deadline_passed"
  | "authority_gap"
  | "evidence_gap";

export type Severity = "info" | "warning" | "critical";

export type CheckStatus = "met" | "unclear" | "missing" | "not_applicable";

export type InfoType = "document" | "date" | "party" | "authority" | "other";

export type Importance = "critical" | "recommended" | "optional";

export interface AgentProposal {
  id: string;
  agent_run_id: string;
  case_id: string;
  organization_id: string;
  agent_id: string;
  agent_version: string;
  model_version: string | null;

  proposal_type: ProposalType;

  // For relationship_proposal
  source_type?: string | null;
  source_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  relationship_type?: string | null;

  // For observation
  observation_type?: ObservationType | null;
  description?: string | null;
  severity?: Severity | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;

  // For procedural_check
  requirement?: string | null;
  check_status?: CheckStatus | null;
  check_detail?: string | null;

  // For missing_info
  info_type?: InfoType | null;
  importance?: Importance | null;

  // Provenance
  confidence: number;
  evidence_ids: string[] | null;
  reasoning_trace: string | null;

  // Lifecycle
  status: ProposalStatus;

  // Review
  reviewed_by?: string | null;
  reviewed_by_type?: string | null;
  reviewed_at?: string | null;
  review_reason?: string | null;

  created_at: string;
}

// ── Agent Feedback ──────────────────────────────────────────────────────────

export interface AgentFeedback {
  id: string;
  proposal_id: string;
  agent_id: string;
  proposal_type: ProposalType;
  confidence: number;
  reviewer_action: "accepted" | "rejected";
  reviewer_id: string;
  reviewer_role: string | null;
  review_reason: string | null;
  created_at: string;
}

// ── Agent Input Snapshot ───────────────────────────────────────────────────
//
// What the agent receives. Read-only copy of case graph + timeline + evidence.

export interface AgentInputSnapshot {
  case_id: string;
  organization_id: string;
  case_name: string;
  case_type: string;
  jurisdiction: string;
  property: {
    apn: string;
    address: string;
    city: string;
    zoning: string;
  };
  timeline: Array<{
    id: string;
    event_date: string;
    event_type: string;
    description: string;
    evidence_id: string | null;
  }>;
  evidence: Array<{
    id: string;
    title: string;
    doc_type: string;
    status: string;
    source: string;
  }>;
  findings: Array<{
    id: string;
    rule: string;
    rule_name: string;
    severity: string;
    status: string;
    detail: string | null;
    evidence_id: string | null;
  }>;
  ce_cases: Array<{
    id: string;
    case_number: string;
    violation_type: string;
    status: string;
    notice_served_date: string | null;
    notice_period_days: number | null;
    compliance_deadline: string | null;
    hearing_date: string | null;
  }>;
  permits: Array<{
    id: string;
    permit_number: string;
    permit_type: string;
    permit_status: string;
    issued_date: string | null;
    expired_date: string | null;
    finalized_date: string | null;
  }>;
  relationships: Array<{
    id: string;
    source_type: string;
    source_id: string;
    target_type: string;
    target_id: string;
    relationship_type: string;
    status: string;
    confidence: number | null;
  }>;
}

// ── Agent Result ───────────────────────────────────────────────────────────
//
// What the agent returns. Proposals only — no mutations.

export interface AgentProposalDraft {
  proposal_type: ProposalType;
  source_type?: string | null;
  source_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  relationship_type?: string | null;
  observation_type?: ObservationType | null;
  description?: string | null;
  severity?: Severity | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  requirement?: string | null;
  check_status?: CheckStatus | null;
  check_detail?: string | null;
  info_type?: InfoType | null;
  importance?: Importance | null;
  confidence: number;
  evidence_ids?: string[] | null;
  reasoning_trace: string;
}

export interface AgentResult {
  proposals: AgentProposalDraft[];
}

// ── Agent Interface ─────────────────────────────────────────────────────────
//
// Every agent implements this interface. The runner calls execute().

export interface Agent {
  definition: AgentDefinition;
  execute(input: AgentInputSnapshot): Promise<AgentResult>;
}
