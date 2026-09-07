/**
 * Builds a case file from a stack of read notices.
 *
 * A single notice is not a case. What matters is the ARC — notice of violation,
 * then compliance order, then hearing (or not), then civil penalty, then lien.
 * Due-process problems live in the gaps between those documents, not inside any
 * one of them: the abatement that came four days after the notice, the penalty
 * with no hearing between it and the order, the escalation that skipped a rung.
 *
 * So this module's job is ordering and gap-finding, not reading. It takes what
 * the vision reader saw and turns it into the chronology the checkpoints and
 * timeline consume.
 *
 * Everything it produces is PROPOSED. A misread date becomes a wrong timeline
 * becomes a wrong finding, so a person confirms before any of it is canonical.
 */

import type { NoticeReading, ExtractedField } from "./notice-reader";

/** Escalation ladder, roughly in the order an enforcement matter climbs it. */
const ESCALATION_ORDER: Record<string, number> = {
  inspection_report: 0,
  notice_of_violation: 1,
  notice_of_abatement: 2,
  compliance_order: 3,
  notice_of_hearing: 4,
  final_finding_and_order: 5,
  administrative_citation: 6,
  civil_penalty_notice: 7,
  lien_notice: 8,
};

/** Map a document type onto the timeline event vocabulary the rules match on. */
const EVENT_TYPE_FOR_DOC: Record<string, string> = {
  inspection_report: "inspection",
  notice_of_violation: "notice",
  notice_of_abatement: "notice",
  administrative_citation: "penalty",
  compliance_order: "order",
  notice_of_hearing: "hearing_notice",
  final_finding_and_order: "decision",
  civil_penalty_notice: "penalty",
  lien_notice: "lien",
  permit_denial: "permit_denied",
  correspondence: "correspondence",
};

export interface ReadDocument {
  evidenceId: string;
  fileName: string;
  reading: NoticeReading;
  needsConfirmation: string[];
}

export interface ProposedEvent {
  evidenceId: string;
  eventDate: string;
  eventType: string;
  description: string;
  /** Exactly what the document showed, so a reviewer can verify the date. */
  dateAsPrinted: string | null;
  confidence: "high" | "medium" | "low";
  /** True when a human must confirm before this becomes canonical. */
  needsConfirmation: boolean;
  confirmationReason: string | null;
}

export interface ArcGap {
  kind:
    | "missing_rung"
    | "no_hearing_before_penalty"
    | "compressed_interval"
    | "undated_document"
    | "out_of_order"
    | "apn_mismatch";
  severity: "high" | "medium" | "low";
  description: string;
  /** Documents this observation concerns. */
  evidenceIds: string[];
  suggestedNextStep: string;
}

export interface BuiltCase {
  events: ProposedEvent[];
  gaps: ArcGap[];
  /** Documents in escalation order, as read. */
  arc: { evidenceId: string; documentType: string; date: string | null }[];
  /** Fields across all documents that a person must confirm. */
  confirmations: { evidenceId: string; fileName: string; fields: string[] }[];
  summary: string;
}

function bestDate(r: NoticeReading): ExtractedField {
  // Service date governs deadlines; fall back to the date on the document's face.
  if (r.serviceDate.value) return r.serviceDate;
  return r.documentDate;
}

function confidenceOf(f: ExtractedField): "high" | "medium" | "low" {
  if (!f.value) return "low";
  if (f.legibility === "clear") return "high";
  if (f.legibility === "partial") return "medium";
  return "low";
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

/**
 * Normalize an APN for comparison. Counties format parcel numbers inconsistently
 * (dashes, spaces, trailing "-000") — comparing raw strings would flag every
 * legitimate document as a mismatch. This strips everything but digits, so
 * "508-141-038-000" and "508 141 038" both reduce to "508141038" and compare
 * as equal on their shared prefix rather than failing on formatting alone.
 */
export function normalizeApn(apn: string): string {
  return apn.replace(/\D/g, "").replace(/0+$/, "");
}

/**
 * A wrong parcel number on a document is not a formatting nitpick — it can
 * mean the document was misfiled into this case entirely, which would poison
 * every downstream deadline and finding computed from it. This check exists
 * because that exact failure mode is easy to introduce silently: a person
 * photographing a stack of papers can include one page from a different
 * matter without noticing, and nothing else in the pipeline would catch it.
 */
function checkApnMismatch(doc: ReadDocument, caseApn: string | null): ArcGap | null {
  if (!caseApn) return null;
  const docApn = doc.reading.apn.value;
  if (!docApn || doc.reading.apn.legibility === "illegible") return null;

  const caseNorm = normalizeApn(caseApn);
  const docNorm = normalizeApn(docApn);
  if (!caseNorm || !docNorm || caseNorm === docNorm) return null;
  // Also accept a prefix match either direction, since counties truncate or
  // append trailing zeros inconsistently across a parcel's own documents.
  if (caseNorm.startsWith(docNorm) || docNorm.startsWith(caseNorm)) return null;

  return {
    kind: "apn_mismatch",
    severity: "high",
    description: `This document shows Assessor's Parcel Number ${docApn}, which does not match this case's parcel number ${caseApn}.`,
    evidenceIds: [doc.evidenceId],
    suggestedNextStep:
      "Confirm this document actually belongs to this case before relying on any date or finding drawn from it. It may have been filed under the wrong property by mistake.",
  };
}

export function buildCase(docs: ReadDocument[], caseApn: string | null = null): BuiltCase {
  const events: ProposedEvent[] = [];
  const gaps: ArcGap[] = [];
  const confirmations: BuiltCase["confirmations"] = [];

  for (const doc of docs) {
    const r = doc.reading;
    const dateField = bestDate(r);
    const docType = r.documentType.value ?? "other";

    if (doc.needsConfirmation.length > 0) {
      confirmations.push({
        evidenceId: doc.evidenceId,
        fileName: doc.fileName,
        fields: doc.needsConfirmation,
      });
    }

    const apnGap = checkApnMismatch(doc, caseApn);
    if (apnGap) gaps.push(apnGap);

    if (!dateField.value) {
      // An undated document cannot be placed on the timeline, and a document
      // that cannot be placed cannot be measured. Say so rather than dropping it.
      gaps.push({
        kind: "undated_document",
        severity: "high",
        description: `No date could be read from ${doc.fileName} (${docType.replace(/_/g, " ")}), so it cannot be placed on the timeline or measured against any deadline.`,
        evidenceIds: [doc.evidenceId],
        suggestedNextStep:
          "Open the original and enter the date by hand, or request a dated copy from the agency.",
      });
      continue;
    }

    const conf = confidenceOf(dateField);
    events.push({
      evidenceId: doc.evidenceId,
      eventDate: dateField.value,
      eventType: EVENT_TYPE_FOR_DOC[docType] ?? "correspondence",
      description: `${docType.replace(/_/g, " ")}${
        r.caseNumber.value ? ` — case ${r.caseNumber.value}` : ""
      }${r.issuingAgency.value ? ` (${r.issuingAgency.value})` : ""}`,
      dateAsPrinted: dateField.asPrinted,
      confidence: conf,
      needsConfirmation: conf !== "high",
      confirmationReason:
        conf !== "high"
          ? `The date was read as "${dateField.asPrinted ?? dateField.value}" with ${dateField.legibility} legibility. Every deadline on this case depends on it.`
          : null,
    });
  }

  events.sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const arc = docs
    .map((d) => ({
      evidenceId: d.evidenceId,
      documentType: d.reading.documentType.value ?? "other",
      date: bestDate(d.reading).value,
    }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  // ── Arc analysis ──
  //
  // Neutral language throughout, matching the policy engine: these are
  // observations about what the documents show, not conclusions about the law.

  const dated = arc.filter((a) => a.date);
  const rung = (t: string) => ESCALATION_ORDER[t] ?? -1;

  // Escalation that skipped a rung.
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const cur = dated[i];
    const jump = rung(cur.documentType) - rung(prev.documentType);
    if (rung(prev.documentType) >= 0 && rung(cur.documentType) >= 0 && jump > 1) {
      gaps.push({
        kind: "missing_rung",
        severity: "medium",
        description: `The documents move from ${prev.documentType.replace(/_/g, " ")} directly to ${cur.documentType.replace(/_/g, " ")}. Intermediate steps that usually appear between them are not in this file.`,
        evidenceIds: [prev.evidenceId, cur.evidenceId],
        suggestedNextStep:
          "Request the complete case file from the agency. The intervening documents may exist and simply not have been served on you.",
      });
    }
  }

  // Penalty or lien with no hearing anywhere before it.
  const firstPenalty = dated.find((a) =>
    ["civil_penalty_notice", "administrative_citation", "lien_notice"].includes(a.documentType),
  );
  if (firstPenalty) {
    const hearingBefore = dated.some(
      (a) =>
        a.documentType === "notice_of_hearing" &&
        a.date! <= firstPenalty.date!,
    );
    if (!hearingBefore) {
      gaps.push({
        kind: "no_hearing_before_penalty",
        severity: "high",
        description: `A ${firstPenalty.documentType.replace(/_/g, " ")} dated ${firstPenalty.date} appears in this file with no notice of hearing preceding it. This reflects the documents gathered here, which may be incomplete.`,
        evidenceIds: [firstPenalty.evidenceId],
        suggestedNextStep:
          "Request the agency's hearing record for this case, including any notice of hearing and any hearing officer's decision.",
      });
    }
  }

  // Unusually tight intervals between rungs — surfaced for a human to weigh
  // against the governing period, not judged here.
  for (let i = 1; i < dated.length; i++) {
    const gapDays = daysBetween(dated[i - 1].date!, dated[i].date!);
    if (gapDays >= 0 && gapDays < 5 && rung(dated[i].documentType) > rung(dated[i - 1].documentType)) {
      gaps.push({
        kind: "compressed_interval",
        severity: "high",
        description: `Only ${gapDays} day${gapDays === 1 ? "" : "s"} separate the ${dated[i - 1].documentType.replace(/_/g, " ")} (${dated[i - 1].date}) from the ${dated[i].documentType.replace(/_/g, " ")} (${dated[i].date}).`,
        evidenceIds: [dated[i - 1].evidenceId, dated[i].evidenceId],
        suggestedNextStep:
          "Check the governing compliance period for this step with counsel. A short interval may be permitted on some enforcement tracks.",
      });
    }
  }

  const summary =
    `Read ${docs.length} document${docs.length === 1 ? "" : "s"}, placed ` +
    `${events.length} on the timeline` +
    (confirmations.length > 0
      ? `, and flagged ${confirmations.length} document${confirmations.length === 1 ? "" : "s"} where a field needs confirming against the original`
      : "") +
    `. ${gaps.length} observation${gaps.length === 1 ? "" : "s"} about the sequence.` +
    (events.some((e) => e.needsConfirmation)
      ? " Some dates were not read cleanly — confirm them before relying on any deadline."
      : "");

  return { events, gaps, arc, confirmations, summary };
}
