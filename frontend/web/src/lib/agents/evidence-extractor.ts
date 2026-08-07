/**
 * Evidence Extractor Agent — Phase 3.4
 *
 * Pure rules engine that analyzes evidence in the case graph and proposes
 * connections between evidence items, findings, and timeline events.
 *
 * The agent CANNOT make legal conclusions, compliance assertions, or
 * authority determinations. It only proposes connections and observes gaps.
 *
 * What it does:
 *   1. Detects findings without supporting evidence → evidence_gap observation
 *   2. Matches evidence to findings by doc_type + keywords → relationship_proposal
 *   3. Matches evidence to timeline events by doc_type → relationship_proposal
 *   4. Flags unlinked evidence (not connected to any finding or event) → observation
 *   5. Flags withdrawn evidence still linked to active findings → observation
 *
 * All language is neutral:
 *   "Evidence 'Notice of Violation' appears related to finding 'missing_notice'"
 * NOT:
 *   "This notice proves the county failed to provide due process"
 */

import type {
  Agent, AgentInputSnapshot, AgentResult,
  AgentProposalDraft, ObservationType, Severity,
} from "./types";

// ── Doc type → Timeline event type mapping ──────────────────────────────────

const DOC_TO_EVENT_TYPE: Record<string, string[]> = {
  notice:      ["ce.notice_served", "ce.notice_issued", "notice_served", "notice_issued"],
  hearing:     ["ce.hearing_scheduled", "hearing_scheduled", "hearing", "ce.hearing"],
  decision:    ["ce.decision", "decision", "ce.decision_issued"],
  compliance:  ["ce.compliance_deadline", "compliance_deadline"],
  permit:      ["permit.issued", "permit.expired", "permit.finalized"],
  appeal:      ["appeal_filed", "ce.appeal_filed"],
  abatement:   ["ce.abatement", "abatement"],
  fine:        ["ce.fine_issued", "fine_issued", "ce.penalty"],
  lien:        ["ce.lien_filed", "lien_filed"],
};

// ── Doc type → Finding rule mapping ──────────────────────────────────────────

const DOC_TO_FINDING_RULE: Record<string, string[]> = {
  notice:       ["missing_notice", "insufficient_notice", "hearing_before_notice"],
  hearing:      ["no_hearing", "hearing_before_notice"],
  permit:       ["no_permit", "expired_permit", "work_without_permit"],
  nuisance:     ["nuisance"],
  substandard:  ["substandard"],
  abatement:    ["abatement_without_notice"],
  fine:         ["deadline_passed"],
  lien:         ["deadline_passed"],
};

// ── Keyword extraction from titles ──────────────────────────────────────────

function titleKeywords(title: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "of", "and", "or", "to", "for", "in", "on", "at",
    "by", "from", "with", "is", "are", "was", "were", "be", "been",
    "this", "that", "these", "those", "it", "its",
    "notice", "document", "letter", "copy",
    "no", "not", "but", "if", "then", "else", "when",
    "has", "have", "had", "do", "does", "did", "will", "would", "shall",
    "may", "might", "can", "could", "should", "must",
    "i", "you", "he", "she", "they", "we", "me", "him", "her", "us", "them",
    "my", "your", "his", "their", "our",
    "as", "so", "than", "too", "very", "also",
    "about", "into", "over", "under", "out", "up", "down", "all",
    "which", "who", "whom", "what", "where", "why", "how",
    "via", "per", "re", "subject",
    "day", "days", "date", "time", "page",
    "exhibit", "attachment",
  ]);
  return title.toLowerCase()
    .split(/[\s\-_,.:;()]+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .filter(w => !/^\d+$/.test(w));
}

// ── Rule: Findings without evidence ────────────────────────────────────────

function checkFindingsWithoutEvidence(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const finding of snapshot.findings) {
    if (finding.status === "closed" || finding.status === "resolved") continue;
    if (finding.evidence_id) continue;

    const severity: Severity = finding.severity === "critical" ? "warning" : "info";

    proposals.push({
      proposal_type: "observation",
      observation_type: "evidence_gap" as ObservationType,
      description:
        `Finding '${finding.rule_name}' (${finding.rule}) has no linked evidence. The finding is based on timeline analysis but lacks documentary support in the evidence vault.`,
      severity,
      related_entity_type: "finding",
      related_entity_id: finding.id,
      confidence: 0.85,
      reasoning_trace:
        `Rule: finding_without_evidence. Input: finding_id=${finding.id}, rule=${finding.rule}, evidence_id=null, status=${finding.status}. Condition: open finding with no evidence_id.`,
    });
  }

  return proposals;
}

// ── Rule: Evidence → Finding matching ────────────────────────────────────────

function checkEvidenceFindingMatch(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const evidence of snapshot.evidence) {
    if (evidence.status === "withdrawn") continue;

    const docType = evidence.doc_type?.toLowerCase() ?? "";
    const keywords = titleKeywords(evidence.title ?? "");
    const expectedRules = DOC_TO_FINDING_RULE[docType] ?? [];

    for (const finding of snapshot.findings) {
      if (finding.status === "closed" || finding.status === "resolved") continue;
      if (finding.evidence_id === evidence.id) continue;

      let score = 0;
      const reasons: string[] = [];

      // Direct doc_type → rule match
      if (expectedRules.includes(finding.rule)) {
        score += 0.35;
        reasons.push(`doc_type '${docType}' maps to rule '${finding.rule}'`);
      }

      // Title keyword overlap with finding rule_name and detail
      const findingText = `${finding.rule_name} ${finding.detail ?? ""}`.toLowerCase();
      const keywordMatches = keywords.filter(kw => findingText.includes(kw));
      if (keywordMatches.length > 0) {
        score += Math.min(0.25, keywordMatches.length * 0.08);
        reasons.push(`${keywordMatches.length} keyword(s) matched: ${keywordMatches.join(", ")}`);
      }

      // Doc type directly mentioned in finding rule name
      if (docType && finding.rule_name.toLowerCase().includes(docType)) {
        score += 0.1;
        reasons.push(`finding rule_name contains doc_type '${docType}'`);
      }

      if (score > 0.25) {
        proposals.push({
          proposal_type: "relationship_proposal",
          source_type: "evidence",
          source_id: evidence.id,
          target_type: "finding",
          target_id: finding.id,
          relationship_type: "supports",
          confidence: Math.min(score, 0.85),
          evidence_ids: [evidence.id],
          reasoning_trace:
            `Evidence '${evidence.title}' (doc_type=${docType}) matched to finding '${finding.rule_name}' (${finding.rule}). Match score: ${score.toFixed(2)}. Match reason: ${reasons.join("; ")}. Evidence status: ${evidence.status}.`,
        });
      }
    }
  }

  // Deduplicate — keep highest-confidence per evidence→finding pair
  const seen = new Map<string, AgentProposalDraft>();
  for (const p of proposals) {
    const key = `${p.source_id}:${p.target_id}`;
    const existing = seen.get(key);
    if (!existing || (existing.confidence ?? 0) < (p.confidence ?? 0)) {
      seen.set(key, p);
    }
  }

  return Array.from(seen.values());
}

// ── Rule: Evidence → Timeline event matching ────────────────────────────────

function checkEvidenceTimelineMatch(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const evidence of snapshot.evidence) {
    if (evidence.status === "withdrawn") continue;

    const docType = evidence.doc_type?.toLowerCase() ?? "";
    const expectedEventTypes = DOC_TO_EVENT_TYPE[docType] ?? [];
    if (expectedEventTypes.length === 0) continue;

    for (const event of snapshot.timeline) {
      if (event.evidence_id === evidence.id) continue;

      let score = 0;
      const reasons: string[] = [];

      if (expectedEventTypes.includes(event.event_type)) {
        score += 0.4;
        reasons.push(`doc_type '${docType}' maps to event_type '${event.event_type}'`);
      }

      const eventText = event.description?.toLowerCase() ?? "";
      const keywords = titleKeywords(evidence.title ?? "");
      const keywordMatches = keywords.filter(kw => eventText.includes(kw));
      if (keywordMatches.length > 0) {
        score += Math.min(0.2, keywordMatches.length * 0.07);
        reasons.push(`${keywordMatches.length} keyword(s) matched in event description`);
      }

      if (score > 0.3) {
        proposals.push({
          proposal_type: "relationship_proposal",
          source_type: "evidence",
          source_id: evidence.id,
          target_type: "timeline_event",
          target_id: event.id,
          relationship_type: "documents",
          confidence: Math.min(score, 0.85),
          evidence_ids: [evidence.id],
          reasoning_trace:
            `Evidence '${evidence.title}' (doc_type=${docType}) matched to timeline event '${event.description}' (${event.event_type}). Match score: ${score.toFixed(2)}. Match reason: ${reasons.join("; ")}.`,
        });
      }
    }
  }

  // Deduplicate
  const seen = new Map<string, AgentProposalDraft>();
  for (const p of proposals) {
    const key = `${p.source_id}:${p.target_id}`;
    const existing = seen.get(key);
    if (!existing || (existing.confidence ?? 0) < (p.confidence ?? 0)) {
      seen.set(key, p);
    }
  }

  return Array.from(seen.values());
}

// ── Rule: Unlinked evidence ──────────────────────────────────────────────────

function checkUnlinkedEvidence(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const evidence of snapshot.evidence) {
    if (evidence.status === "withdrawn") continue;

    const linkedToFinding = snapshot.findings.some(f => f.evidence_id === evidence.id);
    const linkedToEvent = snapshot.timeline.some(e => e.evidence_id === evidence.id);

    if (!linkedToFinding && !linkedToEvent) {
      proposals.push({
        proposal_type: "observation",
        observation_type: "evidence_gap" as ObservationType,
        description:
          `Evidence '${evidence.title}' (doc_type=${evidence.doc_type}, source=${evidence.source}) is present in the evidence vault but not linked to any finding or timeline event. This evidence may be relevant to the case but is currently unconnected.`,
        severity: "info",
        related_entity_type: "evidence",
        related_entity_id: evidence.id,
        confidence: 0.7,
        reasoning_trace:
          `Rule: unlinked_evidence. Input: evidence_id=${evidence.id}, title='${evidence.title}'. Checked: linked_to_finding=${linkedToFinding}, linked_to_event=${linkedToEvent}. Condition: no links found.`,
      });
    }
  }

  return proposals;
}

// ── Rule: Withdrawn evidence linked to active findings ───────────────────────

function checkWithdrawnEvidenceLinked(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  const withdrawnEvidence = snapshot.evidence.filter(e => e.status === "withdrawn");
  if (withdrawnEvidence.length === 0) return proposals;

  for (const evidence of withdrawnEvidence) {
    const linkedFindings = snapshot.findings.filter(
      f => f.evidence_id === evidence.id &&
            (f.status === "open" || f.status === "active"),
    );

    for (const finding of linkedFindings) {
      proposals.push({
        proposal_type: "observation",
        observation_type: "evidence_gap" as ObservationType,
        description:
          `Finding '${finding.rule_name}' (${finding.rule}) references evidence '${evidence.title}' which has been withdrawn. The finding may need re-evaluation or replacement evidence.`,
        severity: "warning",
        related_entity_type: "finding",
        related_entity_id: finding.id,
        confidence: 0.9,
        reasoning_trace:
          `Rule: withdrawn_evidence_linked. Input: evidence_id=${evidence.id} (status=withdrawn), finding_id=${finding.id} (status=${finding.status}). Condition: withdrawn evidence referenced by active finding.`,
      });
    }
  }

  return proposals;
}

// ── Evidence Extractor Agent Definition ──────────────────────────────────────

export const EVIDENCE_EXTRACTOR_AGENT: Agent = {
  definition: {
    id: "agent.evidence_extractor.v1",
    name: "Evidence Extractor",
    agent_type: "evidence_extractor",
    version: "1.0.0",
    capabilities: ["relationship_proposal", "observation"],
    model_version: null,
    description:
      "Analyzes evidence in the case vault and proposes connections to findings and timeline events. Detects evidence gaps where findings lack supporting documentation.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  async execute(input: AgentInputSnapshot): Promise<AgentResult> {
    const proposals: AgentProposalDraft[] = [];

    // 1. Findings without evidence
    proposals.push(...checkFindingsWithoutEvidence(input));

    // 2. Evidence → Finding matching
    proposals.push(...checkEvidenceFindingMatch(input));

    // 3. Evidence → Timeline event matching
    proposals.push(...checkEvidenceTimelineMatch(input));

    // 4. Unlinked evidence
    proposals.push(...checkUnlinkedEvidence(input));

    // 5. Withdrawn evidence linked to active findings
    proposals.push(...checkWithdrawnEvidenceLinked(input));

    return { proposals };
  },
};
