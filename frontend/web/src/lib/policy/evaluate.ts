/**
 * Policy evaluators.
 *
 * These are the only place procedural logic lives. Packs supply parameters;
 * they cannot introduce behavior. Every evaluator returns a neutral status and
 * carries the rule's citation onto the result, so no finding can reach a user
 * without the authority it rests on.
 *
 * Language rule for anything written here: describe the record, not the law.
 * "The record shows 4 days between X and Y" — never "the county violated Y".
 */

import type {
  PolicyPack,
  PolicyRule,
  RuleEvaluation,
  RuleStatus,
} from "./types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id?: string;
  event_date: string;
  event_type: string;
  description?: string | null;
  evidence_id?: string | null;
}

export interface EvidenceItem {
  id: string;
  extracted_text?: string | null;
  ai_summary?: string | null;
  title?: string | null;
}

export interface EvaluationInput {
  timeline: TimelineEvent[];
  evidence: EvidenceItem[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function matchesType(eventType: string | null | undefined, patterns: string[]): boolean {
  const t = (eventType ?? "").toLowerCase();
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

/** Attach rule provenance to an evaluation. */
function build(
  rule: PolicyRule,
  pack: PolicyPack,
  status: RuleStatus,
  detail: string,
  evidenceId: string | null = null,
  recommendedNextAction?: string,
): RuleEvaluation {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    status,
    severity: rule.severity,
    detail,
    evidenceId,
    citation: rule.citation,
    sourceUrl: rule.sourceUrl,
    authority: rule.authority,
    policyVersion: pack.policyVersion,
    packId: pack.id,
    provisional: pack.activationStatus !== "active",
    recommendedNextAction,
  };
}

// ── elapsed_days ────────────────────────────────────────────────────────────
//
// For each action event, find the most recent preceding trigger event and
// report the interval. No trigger at all is NotLocated, not a violation —
// the notice may exist and simply not be in our copy of the file.

function evaluateElapsedDays(
  rule: PolicyRule,
  pack: PolicyPack,
  input: EvaluationInput,
): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  const triggers = rule.triggerEventTypes ?? [];
  const actions = rule.actionEventTypes ?? [];
  const minDays = rule.minCalendarDays;

  if (minDays === undefined) {
    return [
      build(
        rule,
        pack,
        "InsufficientEvidence",
        "This checkpoint has no day count configured in its policy pack.",
        null,
        "Review the policy pack definition for this rule.",
      ),
    ];
  }

  const triggerEvents = input.timeline.filter((e) => matchesType(e.event_type, triggers));
  const actionEvents = input.timeline.filter((e) => matchesType(e.event_type, actions));

  if (actionEvents.length === 0) {
    return [
      build(
        rule,
        pack,
        "AwaitingTrigger",
        `No ${actions.join(" / ")} event is recorded in the case file, so this checkpoint does not yet apply.`,
      ),
    ];
  }

  for (const action of actionEvents) {
    const actionDate = parseDate(action.event_date);
    if (!actionDate) {
      out.push(
        build(
          rule,
          pack,
          "InsufficientEvidence",
          `The ${action.event_type} event has no usable date, so the interval cannot be measured.`,
          action.evidence_id ?? null,
          "Add or correct the event date on the timeline.",
        ),
      );
      continue;
    }

    const preceding = triggerEvents
      .map((t) => ({ event: t, date: parseDate(t.event_date) }))
      .filter((t): t is { event: TimelineEvent; date: Date } => t.date !== null && t.date <= actionDate)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    if (preceding.length === 0) {
      out.push(
        build(
          rule,
          pack,
          "NotLocated",
          `The case file contains no ${triggers.join(" / ")} event preceding the ${action.event_type} recorded on ${action.event_date}.`,
          action.evidence_id ?? null,
          "Request the agency's service records, or add the notice to the case file if you have a copy.",
        ),
      );
      continue;
    }

    const latest = preceding[0];
    const elapsed = daysBetween(latest.date, actionDate);

    if (elapsed < minDays) {
      out.push(
        build(
          rule,
          pack,
          "Observed",
          `The record shows ${elapsed} day${elapsed === 1 ? "" : "s"} between the ${latest.event.event_type} on ${latest.event.event_date} and the ${action.event_type} on ${action.event_date}. The cited authority references a period of ${minDays} days.`,
          action.evidence_id ?? latest.event.evidence_id ?? null,
          "Confirm the service date and the applicable period with counsel before relying on this interval.",
        ),
      );
    } else {
      out.push(
        build(
          rule,
          pack,
          "Satisfied",
          `The record shows ${elapsed} days between the ${latest.event.event_type} and the ${action.event_type}, meeting the ${minDays}-day period referenced by the cited authority.`,
          action.evidence_id ?? null,
        ),
      );
    }
  }

  return out;
}

// ── required_predicate ──────────────────────────────────────────────────────
//
// An adverse action appears; does the record also contain the event that is
// expected to accompany it?

function evaluateRequiredPredicate(
  rule: PolicyRule,
  pack: PolicyPack,
  input: EvaluationInput,
): RuleEvaluation[] {
  const actions = rule.actionEventTypes ?? [];
  const satisfying = rule.satisfyingEventTypes ?? [];

  const actionEvents = input.timeline.filter((e) => matchesType(e.event_type, actions));
  if (actionEvents.length === 0) {
    return [
      build(
        rule,
        pack,
        "AwaitingTrigger",
        `No ${actions.join(" / ")} event is recorded in the case file, so this checkpoint does not yet apply.`,
      ),
    ];
  }

  const satisfyingEvents = input.timeline.filter((e) => matchesType(e.event_type, satisfying));

  if (satisfyingEvents.length > 0) {
    return [
      build(
        rule,
        pack,
        "Satisfied",
        `The case file records a ${satisfyingEvents[0].event_type} on ${satisfyingEvents[0].event_date} alongside the ${actionEvents[0].event_type}.`,
        satisfyingEvents[0].evidence_id ?? null,
      ),
    ];
  }

  const first = actionEvents[0];
  return [
    build(
      rule,
      pack,
      "NotLocated",
      `The case file records a ${first.event_type} on ${first.event_date} but contains no ${satisfying.join(" / ")} event. This reflects the documents currently in the file, which may be incomplete.`,
      first.evidence_id ?? null,
      "Request the agency's hearing and appeal records for this case.",
    ),
  ];
}

// ── required_disclosure ─────────────────────────────────────────────────────
//
// Examine the text of documents linked to specified events for required
// content. Absent extracted text we report InsufficientEvidence — never treat
// an un-OCR'd document as a silent document.

function evaluateRequiredDisclosure(
  rule: PolicyRule,
  pack: PolicyPack,
  input: EvaluationInput,
): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  const docTypes = rule.documentEventTypes ?? [];
  const terms = rule.disclosureTerms ?? [];

  const docEvents = input.timeline.filter((e) => matchesType(e.event_type, docTypes));
  if (docEvents.length === 0) {
    return [
      build(
        rule,
        pack,
        "AwaitingTrigger",
        `No ${docTypes.join(" / ")} document is recorded in the case file, so this checkpoint does not yet apply.`,
      ),
    ];
  }

  for (const evt of docEvents) {
    if (!evt.evidence_id) {
      out.push(
        build(
          rule,
          pack,
          "InsufficientEvidence",
          `The ${evt.event_type} on ${evt.event_date} has no document attached, so its contents cannot be examined.`,
          null,
          "Upload the document to the evidence vault.",
        ),
      );
      continue;
    }

    const ev = input.evidence.find((e) => e.id === evt.evidence_id);
    const text = `${ev?.extracted_text ?? ""} ${ev?.ai_summary ?? ""}`.trim().toLowerCase();

    if (!ev || text.length === 0) {
      out.push(
        build(
          rule,
          pack,
          "InsufficientEvidence",
          `No text has been extracted from the document attached to the ${evt.event_type} on ${evt.event_date}, so its contents cannot be examined.`,
          evt.evidence_id,
          "Run text extraction on this document, or review it manually.",
        ),
      );
      continue;
    }

    const found = terms.find((t) => text.includes(t.toLowerCase()));
    if (found) {
      out.push(
        build(
          rule,
          pack,
          "Satisfied",
          `The document attached to the ${evt.event_type} on ${evt.event_date} refers to "${found}".`,
          evt.evidence_id,
        ),
      );
    } else {
      out.push(
        build(
          rule,
          pack,
          "Observed",
          `The extracted text of the ${evt.event_type} on ${evt.event_date} does not contain any of: ${terms.join(", ")}. Extraction may be incomplete.`,
          evt.evidence_id,
          "Read the original document to confirm before relying on this observation.",
        ),
      );
    }
  }

  return out;
}

// ── record_presence ─────────────────────────────────────────────────────────
//
// Placeholder for recorder-index checks ported from the FairProcess audit
// engine. Until a recorder search is wired, report honestly rather than
// silently returning nothing.

function evaluateRecordPresence(rule: PolicyRule, pack: PolicyPack): RuleEvaluation[] {
  return [
    build(
      rule,
      pack,
      "InsufficientEvidence",
      "Recorder index search is not yet connected, so this checkpoint cannot be evaluated.",
      null,
      "Search the County Recorder index for this parcel and add results to the case file.",
    ),
  ];
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Evaluate every rule in a pack against a case file.
 *
 * Returns evaluations for all statuses including Satisfied — the caller decides
 * what to persist and what to show. Reporting what passed is as much a part of
 * a procedural-integrity report as reporting what did not.
 */
export function evaluatePack(pack: PolicyPack, input: EvaluationInput): RuleEvaluation[] {
  const results: RuleEvaluation[] = [];

  for (const rule of pack.rules) {
    switch (rule.kind) {
      case "elapsed_days":
        results.push(...evaluateElapsedDays(rule, pack, input));
        break;
      case "required_predicate":
        results.push(...evaluateRequiredPredicate(rule, pack, input));
        break;
      case "required_disclosure":
        results.push(...evaluateRequiredDisclosure(rule, pack, input));
        break;
      case "record_presence":
        results.push(...evaluateRecordPresence(rule, pack));
        break;
    }
  }

  return results;
}
