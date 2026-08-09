/**
 * Statute Matcher Agent — Phase 3.3
 *
 * The first semantic agent. Proposes mandated_by relationships between
 * findings and statutes. Triggers the double-review workflow:
 *
 *   Agent proposal → human accepts → relationship (pending_review)
 *   → reviewer accepts → relationship (accepted)
 *
 * Hybrid approach: rules engine matches findings to statutes based on
 * rule type, keywords, and jurisdiction. No LLM.
 *
 * The agent NEVER asserts that a statute applies. It proposes a
 * connection with a confidence score. Humans confirm.
 *
 * All language is neutral:
 *   "Finding 'missing_notice' appears related to HCC § 12.04.030"
 * NOT:
 *   "The county violated HCC § 12.04.030"
 */

import type {
  Agent, AgentDefinition, AgentInputSnapshot, AgentResult,
  AgentProposalDraft, StatuteRef,
} from "./types";

// ── Rule-to-category mapping ────────────────────────────────────────────────
//
// Maps FairProcess finding rule names to statute categories.
// This is the deterministic matching layer.

const RULE_TO_CATEGORY: Record<string, string[]> = {
  missing_notice: ["notice", "hearing"],
  insufficient_notice: ["notice", "hearing"],
  no_hearing: ["hearing"],
  hearing_before_notice: ["notice", "hearing"],
  deadline_passed: ["enforcement"],
  no_compliance_deadline: ["enforcement"],
  nuisance: ["nuisance"],
  substandard: ["substandard"],
  no_permit: ["permit"],
  expired_permit: ["permit"],
  work_without_permit: ["permit"],
  due_process: ["hearing"],
};

// ── Keyword matching ────────────────────────────────────────────────────────
//
// Scores a finding against a statute based on:
//   1. Category match (rule category → statute category)
//   2. Keyword overlap (finding detail text → statute keywords)
//   3. Jurisdiction preference (county > state for local issues)

function scoreMatch(
  finding: { rule: string; rule_name: string; detail: string | null },
  statute: StatuteRef,
): { score: number; match_reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // 1. Category match
  const categories = RULE_TO_CATEGORY[finding.rule] ?? [];
  if (categories.includes(statute.category)) {
    score += 0.4;
    reasons.push(`rule category '${finding.rule}' matches statute category '${statute.category}'`);
  }

  // 2. Keyword overlap — check finding detail and rule_name against statute keywords
  const findingText = `${finding.rule_name} ${finding.detail ?? ""}`.toLowerCase();
  const keywordMatches = statute.keywords.filter(kw =>
    findingText.includes(kw.toLowerCase())
  );
  if (keywordMatches.length > 0) {
    score += Math.min(0.3, keywordMatches.length * 0.1);
    reasons.push(`${keywordMatches.length} keyword(s) matched: ${keywordMatches.join(", ")}`);
  }

  // 3. Rule name direct match — if the rule name contains the statute category
  if (finding.rule_name.toLowerCase().includes(statute.category.toLowerCase())) {
    score += 0.1;
    reasons.push(`rule name contains category word '${statute.category}'`);
  }

  // 4. Notice period match — if finding is about notice and statute defines a notice period
  if ((finding.rule === "missing_notice" || finding.rule === "insufficient_notice") &&
      statute.notice_period_days !== null) {
    score += 0.1;
    reasons.push(`statute defines notice period of ${statute.notice_period_days} days, relevant to notice finding`);
  }

  // 5. Penalty for jurisdiction mismatch — prefer county statutes for local issues
  // (but don't exclude state statutes entirely)
  if (statute.jurisdiction_level === "county") {
    score += 0.05;
  }

  return {
    score: Math.min(score, 0.9), // cap at 0.9 — agents are never certain
    match_reason: reasons.join("; "),
  };
}

// ── Statute Matcher Agent Definition ────────────────────────────────────────

export const STATUTE_MATCHER_AGENT: Agent = {
  definition: {
    id: "agent.statute_matcher.v1",
    name: "Statute Matcher",
    agent_type: "statute_matcher",
    version: "1.0.0",
    capabilities: ["relationship_proposal"],
    model_version: null, // pure rules engine
    description: "Matches findings to applicable statutes based on rule type, keywords, and jurisdiction. Proposes mandated_by relationships with confidence scores.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  async execute(input: AgentInputSnapshot): Promise<AgentResult> {
    const proposals: AgentProposalDraft[] = [];

    // Load statutes from the input snapshot (populated by the runner from
    // the statutes table). Fall back to embedded statutes for unit tests
    // or contexts where the snapshot doesn't include DB-loaded statutes.
    const statutes: StatuteRef[] = input.statutes?.length > 0
      ? input.statutes
      : EMBEDDED_STATUTES;

    for (const finding of input.findings) {
      // Skip findings that are closed/resolved
      if (finding.status === "closed" || finding.status === "resolved") continue;

      let bestMatch: { statute: StatuteRef; score: number; reason: string } | null = null;

      for (const statute of statutes) {
        const result = scoreMatch(finding, statute);
        if (result.score > 0.3 && (!bestMatch || result.score > bestMatch.score)) {
          bestMatch = { statute, score: result.score, reason: result.match_reason };
        }
      }

      if (bestMatch) {
        const proposalId = crypto.randomUUID();
        proposals.push({
          proposal_type: "relationship_proposal",
          source_type: "finding",
          source_id: finding.id,
          target_type: "statute",
          target_id: bestMatch.statute.id,
          relationship_type: "mandated_by",
          confidence: bestMatch.score,
          evidence_ids: finding.evidence_id ? [finding.evidence_id] : [],
          reasoning_trace: `Finding '${finding.rule}' (${finding.rule_name}) matched to ${bestMatch.statute.citation}. Match score: ${bestMatch.score.toFixed(2)}. Match reason: ${bestMatch.reason}. Jurisdiction: ${bestMatch.statute.jurisdiction}.`,
        });


      }
    }

    // Deduplicate — keep only the highest-confidence proposal per finding
    const seen = new Map<string, AgentProposalDraft>();
    for (const p of proposals) {
      const key = `${p.source_type}:${p.source_id}`;
      const existing = seen.get(key);
      if (!existing || (existing.confidence ?? 0) < (p.confidence ?? 0)) {
        seen.set(key, p);
      }
    }

    return { proposals: Array.from(seen.values()) };
  },
};

// ── Embedded Statutes ──────────────────────────────────────────────────────
//
// This mirrors the seed data in migration 014_statute_library.sql.
// In a future iteration, the runner should load these from the DB
// and pass them in the input snapshot. For now, they're embedded
// so the agent can run without a DB query.

const EMBEDDED_STATUTES: StatuteRef[] = [
  {
    id: "statute.hcc.1204",
    citation: "HCC § 12.04.030",
    title: "Notice of Violation Service Requirements",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "notice",
    summary: "Requires service of notice of violation before enforcement action. Minimum 10-day notice period for most violations.",
    keywords: ["notice", "service", "violation", "10 days", "ten days", "notice period"],
    notice_period_days: 10,
  },
  {
    id: "statute.hcc.1204.040",
    citation: "HCC § 12.04.040",
    title: "Notice Period for Hearing",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "hearing",
    summary: "Establishes the minimum notice period before a hearing may be conducted.",
    keywords: ["hearing", "notice", "hearing date", "notice period", "service"],
    notice_period_days: 10,
  },
  {
    id: "statute.gc.11509",
    citation: "GC § 11509",
    title: "Administrative Procedure Act — Hearing Notice",
    jurisdiction: "California",
    jurisdiction_level: "state",
    category: "hearing",
    summary: "California Administrative Procedure Act requires reasonable notice before any administrative hearing.",
    keywords: ["hearing", "notice", "administrative", "10 days", "reasonable notice", "due process"],
    notice_period_days: 10,
  },
  {
    id: "statute.hcc.1204.050",
    citation: "HCC § 12.04.050",
    title: "Hearing Procedures",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "hearing",
    summary: "Governs the conduct of code enforcement hearings including notice requirements, evidence presentation, and decision timelines.",
    keywords: ["hearing", "procedure", "evidence", "decision", "conduct"],
    notice_period_days: null,
  },
  {
    id: "statute.hcc.1204.060",
    citation: "HCC § 12.04.060",
    title: "Enforcement Authority",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "enforcement",
    summary: "Authorizes the county to enforce code violations through administrative penalties, compliance orders, and abatement.",
    keywords: ["enforcement", "penalty", "abatement", "compliance", "authority", "administrative"],
    notice_period_days: null,
  },
  {
    id: "statute.hcc.1204.070",
    citation: "HCC § 12.04.070",
    title: "Compliance Deadlines",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "enforcement",
    summary: "Sets timelines for compliance with code enforcement orders. Default compliance period is 30 days unless otherwise specified.",
    keywords: ["compliance", "deadline", "30 days", "thirty days", "compliance period", "order"],
    notice_period_days: null,
  },
  {
    id: "statute.hcc.312",
    citation: "HCC § 312.0",
    title: "Public Nuisance Abatement",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "nuisance",
    summary: "Defines public nuisances and authorizes abatement procedures. Requires notice to property owner before abatement.",
    keywords: ["nuisance", "abatement", "public nuisance", "property", "owner"],
    notice_period_days: null,
  },
  {
    id: "statute.cc.3479",
    citation: "CC § 3479",
    title: "Public Nuisance Definition",
    jurisdiction: "California",
    jurisdiction_level: "state",
    category: "nuisance",
    summary: "California Civil Code definition of public nuisance.",
    keywords: ["nuisance", "public nuisance", "civil code", "definition", "injurious", "offensive"],
    notice_period_days: null,
  },
  {
    id: "statute.hsc.17920",
    citation: "HSC § 17920",
    title: "Substandard Housing Definition",
    jurisdiction: "California",
    jurisdiction_level: "state",
    category: "substandard",
    summary: "California Health and Safety Code definition of substandard housing conditions.",
    keywords: ["substandard", "housing", "health and safety", "unsafe", "habitable", "conditions"],
    notice_period_days: null,
  },
  {
    id: "statute.hsc.17980",
    citation: "HSC § 17980",
    title: "Substandard Housing Enforcement",
    jurisdiction: "California",
    jurisdiction_level: "state",
    category: "substandard",
    summary: "Authorizes enforcement actions for substandard housing including repair orders and relocation assistance.",
    keywords: ["substandard", "enforcement", "repair", "relocation", "order", "housing"],
    notice_period_days: null,
  },
  {
    id: "statute.hcc.1300",
    citation: "HCC § 1300.0",
    title: "Building Permit Requirements",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "permit",
    summary: "Requires building permits for construction, alteration, or repair of structures.",
    keywords: ["permit", "building", "construction", "alteration", "repair", "without permit"],
    notice_period_days: null,
  },
  {
    id: "statute.hcc.1300.010",
    citation: "HCC § 1300.010",
    title: "Permit Application and Review",
    jurisdiction: "Humboldt County",
    jurisdiction_level: "county",
    category: "permit",
    summary: "Governs the permit application and review process including timelines and requirements for plan submission.",
    keywords: ["permit", "application", "review", "plan", "submission", "timeline"],
    notice_period_days: null,
  },
  {
    id: "statute.gc.11510",
    citation: "GC § 11510",
    title: "Administrative Due Process — Right to Hearing",
    jurisdiction: "California",
    jurisdiction_level: "state",
    category: "hearing",
    summary: "Guarantees the right to a fair hearing in administrative proceedings.",
    keywords: ["due process", "hearing", "right", "fair", "evidence", "cross-examine", "administrative"],
    notice_period_days: null,
  },
];
