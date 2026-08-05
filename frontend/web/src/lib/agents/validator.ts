/**
 * Agent Output Validators — Phase 3.1 hardening (added for Phase 3.2)
 *
 * Two validators run BEFORE proposals are persisted:
 *
 *   1. Capability Validator — checks the proposal type is in the agent's
 *      allowed_outputs list (machine-enforced from agent_definitions).
 *
 *   2. Neutrality Validator — scans all text fields for forbidden language
 *      (legal conclusions, violations, etc.). Rejects proposals that
 *      contain forbidden phrases.
 *
 * The agent does not enforce its own rules. The runtime enforces them.
 */

import type { AgentProposalDraft, ProposalType } from "./types";

// ── Agent Capability Configuration ──────────────────────────────────────────
//
// Loaded from agent_definitions.capabilities (JSON array).
// Enforced at runtime — the agent cannot produce outputs outside its
// declared capabilities.

export interface AgentCapabilities {
  allowed_outputs: ProposalType[];
  forbidden_outputs: string[];    // forbidden proposal types as strings
  forbidden_phrases: string[];    // forbidden language in any text field
}

// ── Default capability sets per agent type ─────────────────────────────────
//
// These are also stored in agent_definitions.capabilities, but having
// them in code ensures enforcement even if the DB row is wrong.

const DEFAULT_CAPABILITIES: Record<string, AgentCapabilities> = {
  timeline_anomaly: {
    allowed_outputs: ["observation", "procedural_check", "missing_info"],
    forbidden_outputs: ["relationship_proposal"],
    forbidden_phrases: [
      "violation", "violated", "illegal", "unlawful", "unlawfully",
      "due process denied", "due process violation",
      "at fault", "culpable", "liable",
      "constitutes a violation", "is a violation",
      "the county is required", "the department must",
      "the agency failed to",
    ],
  },
  statute_matcher: {
    allowed_outputs: ["relationship_proposal"],
    forbidden_outputs: ["observation", "procedural_check", "missing_info"],
    forbidden_phrases: [
      "violates", "violation occurred", "violation of", "illegal", "unlawful",
      "due process denied", "due process violation",
      "at fault", "culpable", "liable",
      "applies because", "is applicable because",
      "constitutes a violation", "is a violation",
      "the county violated", "the department violated",
      "the statute applies",
    ],
  },
  evidence_extractor: {
    allowed_outputs: ["relationship_proposal", "observation"],
    forbidden_outputs: ["procedural_check", "missing_info"],
    forbidden_phrases: [
      "violates", "violation", "illegal", "unlawful",
      "satisfies", "complies with", "meets the requirement",
      "proves", "establishes", "demonstrates compliance",
    ],
  },
  authority_mapper: {
    allowed_outputs: ["relationship_proposal", "missing_info"],
    forbidden_outputs: ["observation", "procedural_check"],
    forbidden_phrases: [
      "failed to act", "acted improperly", "negligent",
      "violation", "illegal", "unlawful",
      "should have", "ought to have",
    ],
  },
};

// ── Validation Result ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  rejected_proposals: Array<{
    draft: AgentProposalDraft;
    reason: string;
    validator: "capability" | "neutrality";
  }>;
  accepted_proposals: AgentProposalDraft[];
}

// ── Capability Validator ────────────────────────────────────────────────────
//
// Checks that each proposal's type is in the agent's allowed_outputs.

export function validateCapability(
  proposals: AgentProposalDraft[],
  agentType: string,
): { accepted: AgentProposalDraft[]; rejected: Array<{ draft: AgentProposalDraft; reason: string }> } {
  const caps = DEFAULT_CAPABILITIES[agentType];
  if (!caps) {
    // Unknown agent type — reject everything
    return {
      accepted: [],
      rejected: proposals.map(draft => ({
        draft,
        reason: `Unknown agent type '${agentType}' — no capability configuration`,
      })),
    };
  }

  const accepted: AgentProposalDraft[] = [];
  const rejected: Array<{ draft: AgentProposalDraft; reason: string }> = [];

  for (const draft of proposals) {
    if (!caps.allowed_outputs.includes(draft.proposal_type)) {
      rejected.push({
        draft,
        reason: `Agent type '${agentType}' cannot produce '${draft.proposal_type}' proposals. Allowed: ${caps.allowed_outputs.join(", ")}`,
      });
      continue;
    }
    accepted.push(draft);
  }

  return { accepted, rejected };
}

// ── Neutrality Validator ─────────────────────────────────────────────────────
//
// Scans all text fields in each proposal for forbidden phrases.
// Forbidden phrases are case-insensitive.

export function validateNeutrality(
  proposals: AgentProposalDraft[],
  agentType: string,
): { accepted: AgentProposalDraft[]; rejected: Array<{ draft: AgentProposalDraft; reason: string }> } {
  const caps = DEFAULT_CAPABILITIES[agentType];
  if (!caps) {
    return { accepted: proposals, rejected: [] };
  }

  const accepted: AgentProposalDraft[] = [];
  const rejected: Array<{ draft: AgentProposalDraft; reason: string }> = [];

  for (const draft of proposals) {
    // Collect all text fields
    const textFields = [
      draft.description,
      draft.check_detail,
      draft.requirement,
      draft.reasoning_trace,
      draft.relationship_type,
    ].filter(Boolean) as string[];

    const allText = textFields.join(" ").toLowerCase();

    let foundPhrase: string | null = null;
    for (const phrase of caps.forbidden_phrases) {
      if (allText.includes(phrase.toLowerCase())) {
        foundPhrase = phrase;
        break;
      }
    }

    if (foundPhrase) {
      rejected.push({
        draft,
        reason: `Neutrality violation: proposal contains forbidden phrase '${foundPhrase}'. Agent outputs must use neutral language.`,
      });
      continue;
    }

    // Also check confidence ceiling (agents are probabilistic)
    if (draft.confidence > 0.95) {
      rejected.push({
        draft,
        reason: `Confidence ${draft.confidence} exceeds maximum (0.95). Agents are probabilistic and cannot be certain.`,
      });
      continue;
    }

    accepted.push(draft);
  }

  return { accepted, rejected };
}

// ── Full Validation Pipeline ────────────────────────────────────────────────
//
// Agent Output → Capability Validator → Neutrality Validator → Proposal Store

export function validateAgentOutput(
  proposals: AgentProposalDraft[],
  agentType: string,
): ValidationResult {
  // Step 1: Capability validation
  const capResult = validateCapability(proposals, agentType);

  // Step 2: Neutrality validation (only on capability-accepted proposals)
  const neuResult = validateNeutrality(capResult.accepted, agentType);

  return {
    valid: neuResult.rejected.length === 0 && capResult.rejected.length === 0,
    rejected_proposals: [
      ...capResult.rejected.map(r => ({ ...r, validator: "capability" as const })),
      ...neuResult.rejected.map(r => ({ ...r, validator: "neutrality" as const })),
    ],
    accepted_proposals: neuResult.accepted,
  };
}
