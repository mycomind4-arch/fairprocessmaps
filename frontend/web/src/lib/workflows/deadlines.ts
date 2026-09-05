/**
 * Response deadline engine.
 *
 * This is the part of the product that most directly protects someone. A person
 * who receives an administrative notice usually has a short, hard window to
 * contest it, and missing that window forfeits the right entirely — no matter
 * how strong the underlying case was. More people lose on the calendar than on
 * the merits.
 *
 * Design commitments, all of which exist because being confidently wrong here
 * causes the exact harm the product is meant to prevent:
 *
 *   - Deadlines are computed from policy pack rules, never from a hardcoded
 *     number, so every date traces to a citation.
 *   - When the governing rule is unverified, the deadline is returned but
 *     clearly marked provisional. We never present an unverified date as
 *     authoritative.
 *   - We compute conservatively: where the window could be read two ways, the
 *     EARLIER date wins, because acting early costs nothing and acting late
 *     costs everything.
 *   - A deadline we cannot compute is reported as unknown, never guessed.
 */

import type { PolicyPack, PolicyRule } from "@/lib/policy/types";

export type DeadlineConfidence = "verified" | "provisional" | "unknown";

export interface ResponseDeadline {
  /** Rule the deadline derives from, or null when unknown. */
  ruleId: string | null;
  label: string;
  /** ISO date (YYYY-MM-DD), or null when it cannot be computed. */
  dueDate: string | null;
  /** Days remaining from the reference date. Negative means already passed. */
  daysRemaining: number | null;
  confidence: DeadlineConfidence;
  citation: string | null;
  sourceUrl: string | null;
  /** Plain-language explanation of how this date was reached. */
  basis: string;
  /** Surfaced prominently — what could make this date wrong. */
  caveats: string[];
}

export interface DeadlineInput {
  /** Date the notice was served or received (ISO). */
  serviceDate: string | null;
  /** Type of notice, matched against rule trigger vocabulary. */
  noticeType: string;
  pack: PolicyPack;
  /** Defaults to today; injected for testing. */
  referenceDate?: string;
}

function parseISO(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * Rules that establish a window a recipient must act within.
 *
 * An `elapsed_days` rule describes a period the AGENCY must wait before acting.
 * That same period is, in practice, the recipient's window to respond — it is
 * the time they have before the agency may proceed. We surface it as such while
 * being explicit in `basis` about what the rule actually says, so the user is
 * never misled about the source of the date.
 */
function candidateRules(pack: PolicyPack, noticeType: string): PolicyRule[] {
  const needle = noticeType.toLowerCase();
  return pack.rules.filter((r) => {
    if (r.kind !== "elapsed_days") return false;
    if (typeof r.minCalendarDays !== "number") return false;
    return (r.triggerEventTypes ?? []).some(
      (t) => needle.includes(t.toLowerCase()) || t.toLowerCase().includes(needle),
    );
  });
}

/**
 * Compute every response window implied by the pack for this notice.
 *
 * Returns the conservative set: one entry per applicable rule, sorted soonest
 * first, so a caller showing only the first shows the tightest deadline.
 */
export function computeDeadlines(input: DeadlineInput): ResponseDeadline[] {
  const reference = parseISO(input.referenceDate ?? toISODate(new Date()))!;
  const service = parseISO(input.serviceDate);
  const packProvisional = input.pack.activationStatus !== "active";

  if (!service) {
    return [
      {
        ruleId: null,
        label: "Response deadline",
        dueDate: null,
        daysRemaining: null,
        confidence: "unknown",
        citation: null,
        sourceUrl: null,
        basis:
          "No service date is recorded for this notice, so no deadline can be computed.",
        caveats: [
          "Add the date the notice was served or received. Until then, assume the deadline may be imminent.",
        ],
      },
    ];
  }

  const rules = candidateRules(input.pack, input.noticeType);

  if (rules.length === 0) {
    return [
      {
        ruleId: null,
        label: "Response deadline",
        dueDate: null,
        daysRemaining: null,
        confidence: "unknown",
        citation: null,
        sourceUrl: null,
        basis: `No checkpoint in ${input.pack.jurisdiction} defines a period triggered by a "${input.noticeType}" notice.`,
        caveats: [
          "A deadline may still apply under an authority this system does not model. Read the notice itself for a stated response date, and confirm with counsel.",
        ],
      },
    ];
  }

  const deadlines = rules.map((rule): ResponseDeadline => {
    const days = rule.minCalendarDays!;
    const due = addDays(service, days);
    const ruleUnverified = (rule.notes ?? "").toUpperCase().includes("UNVERIFIED");

    const caveats: string[] = [];
    if (packProvisional || ruleUnverified) {
      caveats.push(
        "This date derives from a checkpoint that has not completed legal review. Confirm the period with counsel before relying on it.",
      );
    }
    caveats.push(
      "Calculated on calendar days from the service date. If the governing authority counts business days, or runs from receipt rather than service, the real date is later — but do not assume that.",
    );
    caveats.push(
      "If the notice itself states a response date, that date controls over this calculation.",
    );

    return {
      ruleId: rule.id,
      label: rule.name,
      dueDate: toISODate(due),
      daysRemaining: daysBetween(reference, due),
      confidence: packProvisional || ruleUnverified ? "provisional" : "verified",
      citation: rule.citation,
      sourceUrl: rule.sourceUrl,
      basis:
        `${rule.citation} references a period of ${days} calendar days running from ` +
        `${toISODate(service)}. ${rule.description}`,
      caveats,
    };
  });

  // Soonest first: the tightest window is the one that matters.
  return deadlines.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

/**
 * The single deadline to lead with — the earliest computable one.
 *
 * Returns the unknown-deadline entry rather than null when nothing can be
 * computed, so callers always have something honest to display.
 */
export function primaryDeadline(input: DeadlineInput): ResponseDeadline {
  return computeDeadlines(input)[0];
}

export type UrgencyLevel = "passed" | "critical" | "urgent" | "upcoming" | "unknown";

/**
 * Urgency banding for UI treatment.
 *
 * Deliberately pessimistic: an unknown deadline is not treated as "no rush".
 */
export function urgencyOf(deadline: ResponseDeadline): UrgencyLevel {
  if (deadline.daysRemaining === null) return "unknown";
  if (deadline.daysRemaining < 0) return "passed";
  if (deadline.daysRemaining <= 3) return "critical";
  if (deadline.daysRemaining <= 10) return "urgent";
  return "upcoming";
}

export function urgencyMessage(deadline: ResponseDeadline): string {
  const d = deadline.daysRemaining;
  switch (urgencyOf(deadline)) {
    case "passed":
      return `This window appears to have closed ${Math.abs(d!)} day(s) ago. A late response may still be worth filing — ask counsel, and do not treat this as the end of the matter.`;
    case "critical":
      return `${d} day(s) remain. Mail today by a method that produces proof of mailing.`;
    case "urgent":
      return `${d} day(s) remain. Prepare and send the response this week.`;
    case "upcoming":
      return `${d} day(s) remain.`;
    case "unknown":
      return "No deadline could be computed. Read the notice for a stated response date and treat the matter as time-sensitive until confirmed.";
  }
}
