/**
 * Timeline Anomaly Agent — Phase 3.2
 *
 * Hybrid approach: rules engine detects, neutral language describes.
 *
 * The rules engine is deterministic. It checks temporal conditions:
 *   - Notice period before hearing (insufficient interval)
 *   - Compliance deadline passed without resolution
 *   - Hearing date before service date
 *   - Timeline gaps (>90 days between events)
 *   - Missing notice service date when hearing exists
 *   - Missing compliance deadline
 *
 * The agent produces observations, procedural checks, and missing
 * information requests. It NEVER produces findings, legal conclusions,
 * or relationship proposals.
 *
 * All language is neutral:
 *   "Timeline contains a short interval between notice and hearing."
 * NOT:
 *   "The county violated notice requirements."
 */

import type {
  Agent, AgentDefinition, AgentInputSnapshot, AgentResult,
  AgentProposalDraft, ObservationType, Severity, CheckStatus, Importance,
} from "./types";

// ── Helper: days between two dates ─────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number | null {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Helper: days until deadline (positive=future, negative=past/overdue) ───

function daysUntilDeadline(dateStr: string): number | null {
  return daysBetween(new Date().toISOString(), dateStr);
}

// ── Rule: Insufficient notice period ──────────────────────────────────────
//
// Detects: hearing date occurs before the required notice period
// has elapsed after notice was served.

function checkNoticePeriod(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const ce of snapshot.ce_cases) {
    if (!ce.notice_served_date || !ce.hearing_date) continue;

    const interval = daysBetween(ce.notice_served_date, ce.hearing_date);
    if (interval === null) continue;

    const requiredDays = ce.notice_period_days ?? 10; // default 10 days

    if (interval < requiredDays) {
      // Observation
      proposals.push({
        proposal_type: "observation",
        observation_type: "sequence_anomaly",
        description:
          `Timeline shows ${interval} day(s) between documented notice service (${ce.notice_served_date}) and hearing (${ce.hearing_date}). Required minimum is ${requiredDays} day(s).`,
        severity: interval < 3 ? "critical" : "warning",
        related_entity_type: "ce_case",
        related_entity_id: ce.id,
        confidence: 0.95, // deterministic check
        reasoning_trace:
          `Rule: notice_period_check. Input: notice_served_date=${ce.notice_served_date}, hearing_date=${ce.hearing_date}, required=${requiredDays}. Computed interval=${interval} days. Condition: interval < required.`,
      });

      // Procedural check
      proposals.push({
        proposal_type: "procedural_check",
        requirement: "Notice period before hearing",
        check_status: "missing",
        check_detail:
          `${interval} day(s) between notice and hearing; required minimum is ${requiredDays} day(s).`,
        confidence: 0.95,
        reasoning_trace:
          `Procedural check: notice period. Status=missing because computed interval (${interval}) is less than required (${requiredDays}).`,
      });
    } else {
      // Notice period met
      proposals.push({
        proposal_type: "procedural_check",
        requirement: "Notice period before hearing",
        check_status: "met",
        check_detail:
          `${interval} day(s) between notice and hearing; required minimum is ${requiredDays} day(s).`,
        confidence: 0.95,
        reasoning_trace:
          `Procedural check: notice period. Status=met because computed interval (${interval}) >= required (${requiredDays}).`,
      });
    }
  }

  return proposals;
}

// ── Rule: Hearing before service ───────────────────────────────────────────
//
// Detects: hearing date occurs BEFORE notice was served.
// This is a temporal inversion — the hearing happened before anyone was told.

function checkHearingBeforeService(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const ce of snapshot.ce_cases) {
    if (!ce.notice_served_date || !ce.hearing_date) continue;

    const interval = daysBetween(ce.notice_served_date, ce.hearing_date);
    if (interval === null) continue;

    if (interval < 0) {
      proposals.push({
        proposal_type: "observation",
        observation_type: "sequence_anomaly",
        description:
          `Timeline shows hearing date (${ce.hearing_date}) precedes documented notice service date (${ce.notice_served_date}). The hearing occurred ${Math.abs(interval)} day(s) before notice was served.`,
        severity: "critical",
        related_entity_type: "ce_case",
        related_entity_id: ce.id,
        confidence: 0.95,
        reasoning_trace:
          `Rule: hearing_before_service. Input: notice_served_date=${ce.notice_served_date}, hearing_date=${ce.hearing_date}. Computed interval=${interval} days. Condition: interval < 0 (hearing before notice).`,
      });
    }
  }

  return proposals;
}

// ── Rule: Compliance deadline passed ───────────────────────────────────────
//
// Detects: compliance deadline has passed and case is still open.

function checkDeadlinePassed(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const ce of snapshot.ce_cases) {
    if (!ce.compliance_deadline) continue;
    if (ce.status === "closed" || ce.status === "resolved") continue;

    const daysUntil = daysUntilDeadline(ce.compliance_deadline);
    if (daysUntil === null) continue;

    if (daysUntil < 0) {
      // Deadline has passed (negative = past date)
      const daysOverdue = Math.abs(daysUntil);
      proposals.push({
        proposal_type: "observation",
        observation_type: "deadline_passed",
        description:
          `Compliance deadline (${ce.compliance_deadline}) has passed ${daysOverdue} day(s) ago. Case status is ${ce.status}.`,
        severity: daysOverdue > 90 ? "critical" : "warning",
        related_entity_type: "ce_case",
        related_entity_id: ce.id,
        confidence: 0.95,
        reasoning_trace:
          `Rule: deadline_passed. Input: compliance_deadline=${ce.compliance_deadline}, status=${ce.status}. Computed: ${daysOverdue} days overdue. Condition: daysUntil < 0 and case not resolved.`,
      });

      proposals.push({
        proposal_type: "procedural_check",
        requirement: "Compliance within deadline",
        check_status: "missing",
        check_detail:
          `Deadline ${ce.compliance_deadline} passed ${daysOverdue} day(s) ago; case status is ${ce.status}.`,
        confidence: 0.95,
        reasoning_trace:
          `Procedural check: compliance deadline. Status=missing because deadline has passed (${daysOverdue} days overdue) and case is not resolved.`,
      });
    } else {
      // Deadline is in the future
      proposals.push({
        proposal_type: "procedural_check",
        requirement: "Compliance within deadline",
        check_status: "met",
        check_detail:
          `Compliance deadline (${ce.compliance_deadline}) has not passed; ${daysUntil} day(s) remaining.`,
        confidence: 0.95,
        reasoning_trace:
          `Procedural check: compliance deadline. Status=met because deadline has not passed (${daysUntil} days remaining).`,
      });
    }
  }

  return proposals;
}

// ── Rule: Missing notice service date ───────────────────────────────────────
//
// Detects: hearing date exists but no notice served date is recorded.

function checkMissingNotice(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const ce of snapshot.ce_cases) {
    if (ce.hearing_date && !ce.notice_served_date) {
      proposals.push({
        proposal_type: "observation",
        observation_type: "missing_notice",
        description:
          `Hearing date is recorded (${ce.hearing_date}) but no notice service date is documented. The notice period cannot be verified without a service date.`,
        severity: "warning",
        related_entity_type: "ce_case",
        related_entity_id: ce.id,
        confidence: 0.9,
        reasoning_trace:
          `Rule: missing_notice. Input: hearing_date=${ce.hearing_date}, notice_served_date=null. Condition: hearing exists but notice service date is absent.`,
      });

      proposals.push({
        proposal_type: "procedural_check",
        requirement: "Notice period before hearing",
        check_status: "unclear",
        check_detail:
          `Hearing date recorded but notice service date is absent. Notice period cannot be determined.`,
        confidence: 0.9,
        reasoning_trace:
          `Procedural check: notice period. Status=unclear because notice_served_date is null while hearing_date exists.`,
      });

      proposals.push({
        proposal_type: "missing_info",
        info_type: "date",
        importance: "critical",
        description:
          `Documented notice service date for CE case ${ce.case_number || ce.id}`,
        confidence: 0.9,
        reasoning_trace:
          `Missing info: notice service date. Needed to verify notice period for hearing on ${ce.hearing_date}.`,
      });
    }
  }

  return proposals;
}

// ── Rule: Missing compliance deadline ──────────────────────────────────────
//
// Detects: CE case is open but no compliance deadline is set.

function checkMissingDeadline(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const ce of snapshot.ce_cases) {
    if (!ce.compliance_deadline && (ce.status === "open" || ce.status === "active" || ce.status === "pending")) {
      proposals.push({
        proposal_type: "missing_info",
        info_type: "date",
        importance: "recommended",
        description:
          `Compliance deadline for CE case ${ce.case_number || ce.id} (status: ${ce.status})`,
        confidence: 0.85,
        reasoning_trace:
          `Rule: missing_deadline. Input: compliance_deadline=null, status=${ce.status}. Condition: case is open but no deadline is set.`,
      });
    }
  }

  return proposals;
}

// ── Rule: Timeline gaps ─────────────────────────────────────────────────────
//
// Detects: gaps >90 days between consecutive timeline events.

function checkTimelineGaps(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];
  const events = [...snapshot.timeline].sort((a, b) =>
    new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  for (let i = 1; i < events.length; i++) {
    const gap = daysBetween(events[i - 1].event_date, events[i].event_date);
    if (gap === null) continue;

    if (gap > 90) {
      proposals.push({
        proposal_type: "observation",
        observation_type: "timeline_gap",
        description:
          `Timeline gap of ${gap} day(s) between "${events[i - 1].event_type}" (${events[i - 1].event_date}) and "${events[i].event_type}" (${events[i].event_date}).`,
        severity: "info",
        related_entity_type: "event",
        related_entity_id: events[i].id,
        confidence: 0.95,
        reasoning_trace:
          `Rule: timeline_gap. Computed gap=${gap} days between events[${i-1}] and events[${i}]. Condition: gap > 90.`,
      });
    }
  }

  return proposals;
}

// ── Rule: Permit expired but not finalized ──────────────────────────────────
//
// Detects: permit has expired but no finalized date is recorded.

function checkPermitExpired(
  snapshot: AgentInputSnapshot,
): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  for (const permit of snapshot.permits) {
    if (!permit.expired_date) continue;
    if (permit.permit_status === "finalized" || permit.finalized_date) continue;

    const daysUntil = daysUntilDeadline(permit.expired_date);
    if (daysUntil === null) continue;

    if (daysUntil < 0) {
      const daysOverdue = Math.abs(daysUntil);
      proposals.push({
        proposal_type: "observation",
        observation_type: "deadline_passed",
        description:
          `Permit ${permit.permit_number || permit.id} expired on ${permit.expired_date} (${daysOverdue} day(s) ago). No finalization date is recorded.`,
        severity: daysOverdue > 180 ? "warning" : "info",
        related_entity_type: "permit",
        related_entity_id: permit.id,
        confidence: 0.9,
        reasoning_trace:
          `Rule: permit_expired. Input: expired_date=${permit.expired_date}, finalized_date=null. Computed: ${daysOverdue} days overdue. Condition: expired and not finalized.`,
      });
    }
  }

  return proposals;
}

// ── Agent Definition ─────────────────────────────────────────────────────────

export const TIMELINE_ANOMALY_AGENT: Agent = {
  definition: {
    id: "agent.timeline_anomaly.v1",
    name: "Timeline Anomaly Detector",
    agent_type: "timeline_anomaly",
    version: "1.0.0",
    capabilities: ["observation", "procedural_check", "missing_info"],
    model_version: null, // no LLM — pure rules engine
    description: "Detects procedural sequence anomalies in case timelines using deterministic rules.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  async execute(input: AgentInputSnapshot): Promise<AgentResult> {
    const proposals: AgentProposalDraft[] = [];

    // Run all rules
    proposals.push(...checkNoticePeriod(input));
    proposals.push(...checkHearingBeforeService(input));
    proposals.push(...checkDeadlinePassed(input));
    proposals.push(...checkMissingNotice(input));
    proposals.push(...checkMissingDeadline(input));
    proposals.push(...checkTimelineGaps(input));
    proposals.push(...checkPermitExpired(input));

    // Deduplicate: if the same observation was produced by multiple rules,
    // keep only the first occurrence
    const seen = new Set<string>();
    const deduped = proposals.filter(p => {
      const key = `${p.proposal_type}:${p.description ?? ""}:${p.observation_type ?? ""}:${p.requirement ?? ""}:${p.check_status ?? ""}:${p.info_type ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { proposals: deduped };
  },
};
