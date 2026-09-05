/**
 * Policy pack contract.
 *
 * A policy pack is versioned, citation-anchored data — never code. Every
 * procedural checkpoint FairProcess evaluates must trace to a rule in a pack,
 * and every rule must carry the citation and source URL a reader can verify
 * for themselves.
 *
 * Ported from the FairProcess `policy-engine` package (policies/humboldt/*.json),
 * which established this format. The evaluators live in ./evaluate.ts.
 */

// ── Neutral status vocabulary ───────────────────────────────────────────────
//
// FairProcess reports what the record shows, not what the law concludes. A
// checkpoint that fails is never "a violation" — it is a condition observed in
// the available evidence, which a human reviews.
//
// This vocabulary is the product's core legal-safety boundary. Do not add a
// status that asserts wrongdoing, and do not render a raw status to a user
// without the accompanying citation.

export type RuleStatus =
  /** The condition described by the rule is present in the record. */
  | "Observed"
  /** An expected record was not found in the evidence available to us. */
  | "NotLocated"
  /** Required inputs are absent; the checkpoint cannot be evaluated. */
  | "InsufficientEvidence"
  /** The triggering event has not occurred yet; the rule is not ripe. */
  | "AwaitingTrigger"
  /** The checkpoint is met by the record. */
  | "Satisfied";

/** Statuses that should surface to the user as something to act on. */
export const ACTIONABLE_STATUSES: readonly RuleStatus[] = [
  "Observed",
  "NotLocated",
  "InsufficientEvidence",
];

/**
 * Human-facing gloss for each status. Deliberately descriptive, never
 * accusatory — this text is what appears on an exported report.
 */
export const STATUS_LABELS: Record<RuleStatus, string> = {
  Observed: "Observed in record",
  NotLocated: "Not located",
  InsufficientEvidence: "Insufficient evidence",
  AwaitingTrigger: "Awaiting trigger",
  Satisfied: "Satisfied",
};

export const STATUS_DESCRIPTIONS: Record<RuleStatus, string> = {
  Observed:
    "The condition this checkpoint describes appears in the records currently in the case file.",
  NotLocated:
    "A record this checkpoint expects was not found in the evidence available. This is not proof the record does not exist.",
  InsufficientEvidence:
    "The case file does not yet contain the dates or documents needed to evaluate this checkpoint.",
  AwaitingTrigger:
    "The event that starts this checkpoint's clock has not been established in the record.",
  Satisfied: "The records in the case file meet this checkpoint.",
};

// ── Severity ────────────────────────────────────────────────────────────────

export type Severity = "critical" | "warning" | "info";

// ── Rule kinds ──────────────────────────────────────────────────────────────

/**
 * Which evaluator handles a rule. Adding a kind means adding an evaluator in
 * ./evaluate.ts — packs cannot introduce new logic, only new parameters.
 */
export type RuleKind =
  /** Minimum elapsed days between a trigger event and a subsequent action. */
  | "elapsed_days"
  /** A required event must appear in the record before an adverse action. */
  | "required_predicate"
  /** A document must disclose specified content (e.g. appeal rights). */
  | "required_disclosure"
  /** A record expected at the county recorder / agency was searched for. */
  | "record_presence";

// ── Pack shape ──────────────────────────────────────────────────────────────

export interface PolicyRule {
  /** Stable id, referenced by findings. Never reuse across meanings. */
  id: string;
  kind: RuleKind;
  /** Short human-readable name shown on a finding card. */
  name: string;
  /** What this checkpoint examines, in plain language. */
  description: string;
  severity: Severity;

  /** Statutory or case-law citation. Required — a rule without one cannot ship. */
  citation: string;
  /** URL a reader can open to read the cited text. Required. */
  sourceUrl: string;
  /** Who promulgated or decided the cited authority. */
  authority: string;

  /**
   * Honest note about what the reviewed text does and does not establish.
   * Surfaces to reviewers so a day-count is never taken on faith.
   */
  notes?: string;

  // ── Evaluator parameters (kind-specific) ──

  /** elapsed_days: minimum calendar days required between trigger and action. */
  minCalendarDays?: number;
  /** elapsed_days / required_predicate: timeline event types that start the clock. */
  triggerEventTypes?: string[];
  /** elapsed_days / required_predicate: timeline event types that end it. */
  actionEventTypes?: string[];
  /** required_predicate: event types that satisfy the checkpoint. */
  satisfyingEventTypes?: string[];
  /** required_disclosure: terms whose presence in document text satisfies the rule. */
  disclosureTerms?: string[];
  /** required_disclosure: event types whose linked evidence is examined. */
  documentEventTypes?: string[];
}

export interface PolicyPack {
  /** Pack identifier, e.g. "humboldt-code-enforcement". */
  id: string;
  jurisdiction: string;
  /** Which case types this pack applies to. */
  caseTypes: string[];
  /**
   * Version stamped onto every finding this pack produces, so a report can be
   * reproduced against the exact rule text that generated it.
   */
  policyVersion: string;
  /**
   * Gate on unreviewed legal content. A pack marked `legal_review_required`
   * still evaluates, but findings are flagged as provisional in the UI and
   * excluded from exports. Only a qualified human moves a pack to `active`.
   */
  activationStatus: "active" | "legal_review_required";
  /** Who reviewed the pack, if anyone has. */
  reviewedBy?: string;
  reviewedAt?: string;
  rules: PolicyRule[];
}

// ── Evaluation output ───────────────────────────────────────────────────────

export interface RuleEvaluation {
  ruleId: string;
  ruleName: string;
  status: RuleStatus;
  severity: Severity;
  /** Neutral description of what the record shows. */
  detail: string;
  evidenceId: string | null;

  // Provenance — carried onto the persisted finding.
  citation: string;
  sourceUrl: string;
  authority: string;
  policyVersion: string;
  packId: string;
  /** True when the pack has not cleared legal review. */
  provisional: boolean;

  /** What a human could do to resolve an unevaluable checkpoint. */
  recommendedNextAction?: string;
}
