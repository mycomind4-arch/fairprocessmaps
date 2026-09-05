/**
 * Adapters that project structured county records into timeline events.
 *
 * The policy evaluators read one shape: a timeline. Rather than teaching them
 * about code-enforcement rows and permit rows, we normalize those into the
 * same event stream the user sees. One consequence worth keeping: a finding
 * derived from a county record points at a date the user can also see on the
 * timeline, so nothing is asserted from data the user cannot inspect.
 */

import type { TimelineEvent } from "./evaluate";

export interface CodeEnforcementCase {
  case_number?: string | null;
  notice_served_date?: string | null;
  hearing_date?: string | null;
  abatement_date?: string | null;
  appeal_date?: string | null;
  appeal_filed?: unknown;
  status?: string | null;
  closed_date?: string | null;
}

export interface BuildingPermit {
  permit_number?: string | null;
  permit_status?: string | null;
  issued_date?: string | null;
  finalized_date?: string | null;
  expiration_date?: string | null;
  applied_date?: string | null;
}

function evt(
  date: string | null | undefined,
  type: string,
  description: string,
): TimelineEvent | null {
  if (!date) return null;
  return { event_date: date, event_type: type, description, evidence_id: null };
}

/** Derive timeline events from code enforcement case rows. */
export function eventsFromCodeEnforcement(cases: CodeEnforcementCase[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  for (const ce of cases) {
    const ref = ce.case_number ? ` (case ${ce.case_number})` : "";

    const candidates = [
      evt(ce.notice_served_date, "notice", `Notice of violation served${ref}`),
      evt(ce.hearing_date, "hearing", `Hearing${ref}`),
      evt(ce.abatement_date, "abatement", `Abatement${ref}`),
      evt(ce.appeal_date, "appeal", `Appeal${ref}`),
    ];

    // Closure is only an event when the county recorded a date for it.
    const closed = ce.status === "closed" || ce.status === "abated";
    if (closed) {
      candidates.push(
        evt(
          ce.closed_date ?? ce.abatement_date,
          "case_closed",
          `Case closed with status "${ce.status}"${ref}`,
        ),
      );
    }

    for (const c of candidates) if (c) out.push(c);
  }

  return out;
}

/** Derive timeline events from building permit rows. */
export function eventsFromPermits(permits: BuildingPermit[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];

  for (const p of permits) {
    const ref = p.permit_number ? ` (permit ${p.permit_number})` : "";

    const candidates = [
      evt(p.applied_date, "permit_applied", `Permit application filed${ref}`),
      evt(p.issued_date, "permit_issued", `Permit issued${ref}`),
      evt(p.finalized_date, "permit_finalized", `Permit finalized${ref}`),
    ];

    if (p.permit_status === "denied") {
      candidates.push(
        evt(
          p.expiration_date ?? p.applied_date,
          "permit_denied",
          `Permit denied${ref}`,
        ),
      );
    }
    if (p.permit_status === "expired" && !p.issued_date) {
      candidates.push(
        evt(p.expiration_date, "permit_expired", `Permit expired without issuance${ref}`),
      );
    }

    for (const c of candidates) if (c) out.push(c);
  }

  return out;
}
