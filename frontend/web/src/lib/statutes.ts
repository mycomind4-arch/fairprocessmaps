/**
 * Humboldt County Statute Library
 * 
 * Real statutory deadlines and procedural requirements for due process analysis.
 * Ported from fairprocess-ai's statuteMatchingAgent and expanded.
 * 
 * Every rule uses evidentiary language — no legal conclusions.
 */

export interface StatuteRule {
  ref: string;
  title: string;
  description: string;
  deadline_type: "business_days" | "calendar_days";
  deadline_value: number;
  deadline_direction: "max" | "min";
  category: "notice" | "hearing" | "appeal" | "permit" | "enforcement" | "recording";
  source: string;
}

export const STATUTES: StatuteRule[] = [
  {
    ref: "HCC § 351-7",
    title: "Citation Mailing Deadline",
    description: "Citation shall be mailed within 3 business days of execution. Mailing date = postmark date.",
    deadline_type: "business_days",
    deadline_value: 3,
    deadline_direction: "max",
    category: "notice",
    source: "Humboldt County Code",
  },
  {
    ref: "HCC § 351-12",
    title: "Notice Publication Before Hearing",
    description: "Notice published at least 10 days before hearing date.",
    deadline_type: "calendar_days",
    deadline_value: 10,
    deadline_direction: "min",
    category: "hearing",
    source: "Humboldt County Code",
  },
  {
    ref: "CA Gov Code § 65852.2",
    title: "ADU Application Review Period",
    description: "Approve or disapprove ADU application within 60 days of complete application.",
    deadline_type: "calendar_days",
    deadline_value: 60,
    deadline_direction: "max",
    category: "permit",
    source: "California Government Code",
  },
  {
    ref: "HCC § 4.2",
    title: "Enforcement Notice Posting",
    description: "Notice posted and mailed within 5 business days of enforcement action.",
    deadline_type: "business_days",
    deadline_value: 5,
    deadline_direction: "max",
    category: "enforcement",
    source: "Humboldt County Code",
  },
  {
    ref: "CA Gov Code § 65905",
    title: "Zoning Decision Appeal Period",
    description: "Appeal period of 10 calendar days for zoning/planning decisions.",
    deadline_type: "calendar_days",
    deadline_value: 10,
    deadline_direction: "min",
    category: "appeal",
    source: "California Government Code",
  },
  {
    ref: "HCC § 311-3",
    title: "Nuisance Abatement Notice Period",
    description: "Property owner must receive notice and a reasonable period (minimum 30 days) to abate nuisance before administrative action.",
    deadline_type: "calendar_days",
    deadline_value: 30,
    deadline_direction: "min",
    category: "enforcement",
    source: "Humboldt County Code",
  },
  {
    ref: "CA Gov Code § 53069.4",
    title: "Administrative Citation Appeal",
    description: "Recipient has 10 calendar days to request administrative hearing on citation.",
    deadline_type: "calendar_days",
    deadline_value: 10,
    deadline_direction: "min",
    category: "appeal",
    source: "California Government Code",
  },
  {
    ref: "CA Gov Code § 65863.3",
    title: "Permit Decision Notification",
    description: "Permit applicant must be notified of decision within 30 days. Denial must include findings and appeal rights.",
    deadline_type: "calendar_days",
    deadline_value: 30,
    deadline_direction: "max",
    category: "permit",
    source: "California Government Code",
  },
  {
    ref: "HCC § 351-9",
    title: "Recording of Enforcement Orders",
    description: "Final enforcement orders recorded with County Recorder within 5 business days of effective date.",
    deadline_type: "business_days",
    deadline_value: 5,
    deadline_direction: "max",
    category: "recording",
    source: "Humboldt County Code",
  },
  {
    ref: "CA CCP § 1094.5",
    title: "Writ of Mandate Filing",
    description: "Petition for writ of administrative mandate must be filed within 90 days of final administrative decision.",
    deadline_type: "calendar_days",
    deadline_value: 90,
    deadline_direction: "max",
    category: "appeal",
    source: "California Code of Civil Procedure",
  },
];

export function getStatutesByCategory(category: string): StatuteRule[] {
  return STATUTES.filter(s => s.category === category);
}

export function findStatute(ref: string): StatuteRule | undefined {
  return STATUTES.find(s => s.ref === ref);
}

/**
 * Calculate business days between two dates (excluding weekends).
 */
export function businessDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/**
 * Calculate calendar days between two dates.
 */
export function calendarDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

/**
 * Check if elapsed time matches the statutory deadline.
 * Returns "matches expected window", "deviation detected", or "unable to determine".
 */
export function evaluateDeadline(
  startDate: string,
  endDate: string,
  statute: StatuteRule
): { status: string; elapsedDays: number; note: string } {
  const elapsed = statute.deadline_type === "business_days"
    ? businessDaysBetween(startDate, endDate)
    : calendarDaysBetween(startDate, endDate);

  if (elapsed === 0 && !startDate) {
    return { status: "unable to determine", elapsedDays: 0, note: "Missing start date for deadline calculation." };
  }

  const meets = statute.deadline_direction === "max"
    ? elapsed <= statute.deadline_value
    : elapsed >= statute.deadline_value;

  const note = statute.deadline_direction === "max"
    ? `${elapsed} ${statute.deadline_type === "business_days" ? "business" : "calendar"} days elapsed (max allowed: ${statute.deadline_value}). ${meets ? "Within" : "Exceeds"} the required window.`
    : `${elapsed} ${statute.deadline_type === "business_days" ? "business" : "calendar"} days elapsed (min required: ${statute.deadline_value}). ${meets ? "Meets" : "Does not meet"} the required window.`;

  return {
    status: meets ? "matches expected window" : "deviation detected",
    elapsedDays: elapsed,
    note,
  };
}
