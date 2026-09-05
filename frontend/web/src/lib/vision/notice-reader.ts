/**
 * Reads a photographed or scanned agency notice.
 *
 * The people this product serves photograph their paperwork. A notice of
 * abatement arrives as a phone picture of a taped-up placard, or a scan of a
 * certified letter, or a screenshot of a portal PDF. Until now the pipeline
 * only read text/* uploads, which meant it could not read the actual evidence.
 *
 * ## Reading a document is not the same as trusting it
 *
 * A model reading a blurry photograph will produce confident text either way.
 * The failure mode is not "it says it cannot read it" — it is a plausible
 * misread of a date, and one wrong digit in a service date moves every deadline
 * in the case. So:
 *
 *   - Every extracted field carries the VERBATIM text the model says it saw,
 *     plus the page it appeared on, so a human can check the field against the
 *     image without re-reading the whole document.
 *   - Every field carries its own legibility rating. A crisp case number and a
 *     smudged date in the same document must not share one confidence score.
 *   - Dates are additionally returned as the raw string as printed. "4/2/26"
 *     is ambiguous between April 2 and February 4 in different conventions;
 *     we keep what was on the paper alongside our reading of it.
 *   - Nothing extracted here becomes a canonical case fact on its own. Output
 *     is a proposal a person confirms, consistent with the rest of the system.
 */

import { callClaude, callClaudeDocuments, type ClaudeBindingEnv, type ClaudeDocument } from "@/lib/claude";

export type Legibility = "clear" | "partial" | "illegible";

export interface ExtractedField<T = string> {
  value: T | null;
  /** Exactly what appears on the document, before interpretation. */
  asPrinted: string | null;
  /** 1-based page the value was read from. */
  page: number | null;
  legibility: Legibility;
  /** Why the model is unsure, when it is. */
  note?: string | null;
}

export interface NoticeReading {
  /** What kind of document this is. */
  documentType: ExtractedField;
  issuingAgency: ExtractedField;
  /** The date the document itself bears. */
  documentDate: ExtractedField;
  /** The date of service or posting, when stated separately. */
  serviceDate: ExtractedField;
  serviceMethod: ExtractedField;
  caseNumber: ExtractedField;
  apn: ExtractedField;
  propertyAddress: ExtractedField;
  recipientName: ExtractedField;

  /** Deadline the document states on its face. Outranks any computed date. */
  statedDeadline: ExtractedField;
  statedDeadlineText: ExtractedField;

  /** Money demanded, if any. */
  penaltyAmount: ExtractedField;

  allegedConditions: { description: string; asPrinted: string; page: number }[];
  citedAuthorities: { citation: string; asPrinted: string; page: number }[];
  appealRights: {
    mentioned: boolean;
    asPrinted: string | null;
    page: number | null;
  };

  agencyContact: {
    name: string | null;
    address: string | null;
    phone: string | null;
  };

  /** Overall document legibility, and what a human should re-check. */
  overallLegibility: Legibility;
  humanReviewNeeded: string[];
  /** Anything the model saw that did not fit the schema but looks material. */
  otherObservations: string[];
}

const SYSTEM = `You transcribe and extract facts from photographs of government notices.

You are reading images of real paperwork someone received from a local agency —
often phone photos, sometimes skewed, shadowed, or partially cut off. Your
output feeds a legal deadline calculator, so a misread date causes real harm.

RULES:

1. TRANSCRIBE BEFORE YOU INTERPRET. For every field, "asPrinted" must be the
   exact characters visible on the document. "value" is your normalized reading.
   If a date is printed "4/2/26", asPrinted is "4/2/26" and value is your
   ISO reading — but set legibility to "partial" and explain the ambiguity in
   "note", because that string is genuinely ambiguous.

2. NEVER GUESS AT ILLEGIBLE TEXT. If you cannot read a character, set value to
   null and legibility to "illegible". A null the human fills in is safe. A
   guess that looks confident is not. Do not infer a digit from context.

3. RATE EACH FIELD SEPARATELY. A crisp case number and a smudged date in the
   same photo do not share a confidence.

4. DO NOT INFER UNSTATED FACTS. If the document does not give a service date,
   serviceDate.value is null — even if you can guess from a postmark or a
   nearby date. Do not compute deadlines. Do not decide what the law requires.

5. QUOTE ALLEGATIONS, DO NOT ENDORSE THEM. Alleged conditions are what the
   agency asserts. Record them as written.

6. FLAG WHAT NEEDS HUMAN EYES in humanReviewNeeded: cut-off edges, fields you
   rated partial or illegible, handwriting, stamps, anything ambiguous.

Respond with JSON only, matching this shape. Every ExtractedField is
{"value": ..., "asPrinted": ..., "page": n, "legibility": "clear|partial|illegible", "note": ...}:

{"documentType": Field, "issuingAgency": Field, "documentDate": Field,
 "serviceDate": Field, "serviceMethod": Field, "caseNumber": Field, "apn": Field,
 "propertyAddress": Field, "recipientName": Field, "statedDeadline": Field,
 "statedDeadlineText": Field, "penaltyAmount": Field,
 "allegedConditions": [{"description": s, "asPrinted": s, "page": n}],
 "citedAuthorities": [{"citation": s, "asPrinted": s, "page": n}],
 "appealRights": {"mentioned": bool, "asPrinted": s|null, "page": n|null},
 "agencyContact": {"name": s|null, "address": s|null, "phone": s|null},
 "overallLegibility": "clear|partial|illegible",
 "humanReviewNeeded": [s], "otherObservations": [s]}

Document types to use where they fit: notice_of_violation, notice_of_abatement,
administrative_citation, compliance_order, final_finding_and_order,
notice_of_hearing, civil_penalty_notice, lien_notice, permit_denial,
inspection_report, correspondence, other.`;

function emptyField(): ExtractedField {
  return { value: null, asPrinted: null, page: null, legibility: "illegible" };
}

/** Guard against a model returning a bare string where a field object belongs. */
function normalizeField(raw: unknown): ExtractedField {
  if (!raw || typeof raw !== "object") {
    return typeof raw === "string" && raw.trim()
      ? { value: raw, asPrinted: raw, page: null, legibility: "partial", note: "Model returned a bare value without transcription detail." }
      : emptyField();
  }
  const f = raw as Record<string, unknown>;
  const legibility = f.legibility as Legibility;
  return {
    value: (f.value as string) ?? null,
    asPrinted: (f.asPrinted as string) ?? null,
    page: typeof f.page === "number" ? f.page : null,
    legibility: ["clear", "partial", "illegible"].includes(legibility) ? legibility : "partial",
    note: (f.note as string) ?? null,
  };
}

export interface ReadNoticeResult {
  reading: NoticeReading;
  /** Fields the caller should surface for confirmation before relying on them. */
  needsConfirmation: string[];
  /** Plain-text rendering, stored as the document's extracted_text. */
  transcript: string;
}

/**
 * Read one notice, which may span several pages or files.
 *
 * Binary sources (PDF, images) go up as document blocks. A source whose text
 * was extracted locally — a .docx, a .txt — is passed as `plainText` and read
 * through the text path instead. Both produce the same structured reading, so
 * the rest of the pipeline never learns what format the evidence arrived in.
 *
 * Legibility means something different for the two: characters in a .docx are
 * exact, so a field read from `plainText` is only ever "clear" or absent, and
 * the model is told so explicitly rather than inventing uncertainty.
 */
export async function readNotice(
  env: ClaudeBindingEnv,
  documents: ClaudeDocument[],
  plainText?: string,
): Promise<ReadNoticeResult> {
  const instruction =
    `Transcribe before interpreting, rate each field's legibility separately, ` +
    `and use null for anything you cannot read with confidence.`;

  const raw =
    documents.length > 0
      ? await callClaudeDocuments(env, {
          system: SYSTEM,
          documents,
          user: `Extract the facts from this ${documents.length}-part document. ${instruction}`,
          maxTokens: 4096,
        })
      : await callClaude(env, {
          system: SYSTEM,
          user:
            `Extract the facts from the document text below. The text was extracted ` +
            `exactly from the source file, so characters are not in doubt — rate a ` +
            `field "clear" when present and use null when absent. Do not report ` +
            `illegibility for text you can plainly read. ${instruction}\n\n` +
            `--- BEGIN DOCUMENT TEXT ---\n${(plainText ?? "").slice(0, 60000)}\n--- END DOCUMENT TEXT ---`,
          maxTokens: 4096,
        });

  if (documents.length === 0 && !plainText?.trim()) {
    throw new Error("readNotice needs either a document or extracted text");
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const fieldNames = [
    "documentType", "issuingAgency", "documentDate", "serviceDate", "serviceMethod",
    "caseNumber", "apn", "propertyAddress", "recipientName", "statedDeadline",
    "statedDeadlineText", "penaltyAmount",
  ] as const;

  const reading = {
    ...Object.fromEntries(fieldNames.map((n) => [n, normalizeField(parsed[n])])),
    allegedConditions: Array.isArray(parsed.allegedConditions) ? parsed.allegedConditions : [],
    citedAuthorities: Array.isArray(parsed.citedAuthorities) ? parsed.citedAuthorities : [],
    appealRights:
      (parsed.appealRights as NoticeReading["appealRights"]) ??
      { mentioned: false, asPrinted: null, page: null },
    agencyContact:
      (parsed.agencyContact as NoticeReading["agencyContact"]) ??
      { name: null, address: null, phone: null },
    overallLegibility: (parsed.overallLegibility as Legibility) ?? "partial",
    humanReviewNeeded: Array.isArray(parsed.humanReviewNeeded)
      ? (parsed.humanReviewNeeded as string[])
      : [],
    otherObservations: Array.isArray(parsed.otherObservations)
      ? (parsed.otherObservations as string[])
      : [],
  } as unknown as NoticeReading;

  // Anything not read cleanly gets surfaced. Dates are held to a higher bar
  // than everything else, because a wrong date moves every deadline downstream.
  const needsConfirmation: string[] = [];
  for (const name of fieldNames) {
    const f = reading[name] as ExtractedField;
    const isDate = name.toLowerCase().includes("date") || name === "statedDeadline";
    if (!f.value) continue;
    if (f.legibility === "illegible" || (isDate && f.legibility !== "clear")) {
      needsConfirmation.push(name);
    }
  }
  if (reading.serviceDate.value === null) needsConfirmation.push("serviceDate");

  return { reading, needsConfirmation, transcript: renderTranscript(reading) };
}

/**
 * Flatten a reading into searchable text.
 *
 * Stored as the evidence row's extracted_text so the existing text-based
 * analyzers, search index, and disclosure checkpoints work on photographed
 * documents exactly as they do on text uploads — the rest of the system does
 * not need to know the document arrived as a photograph.
 */
export function renderTranscript(r: NoticeReading): string {
  const lines: string[] = [];
  const put = (label: string, f: ExtractedField) => {
    if (f.asPrinted || f.value) {
      lines.push(`${label}: ${f.asPrinted ?? f.value}${f.legibility !== "clear" ? `  [${f.legibility}]` : ""}`);
    }
  };

  put("Document type", r.documentType);
  put("Issuing agency", r.issuingAgency);
  put("Document date", r.documentDate);
  put("Service date", r.serviceDate);
  put("Service method", r.serviceMethod);
  put("Case number", r.caseNumber);
  put("APN", r.apn);
  put("Property", r.propertyAddress);
  put("Recipient", r.recipientName);
  put("Stated deadline", r.statedDeadline);
  put("Deadline language", r.statedDeadlineText);
  put("Penalty amount", r.penaltyAmount);

  if (r.allegedConditions.length) {
    lines.push("", "Alleged conditions (as stated by the agency):");
    for (const c of r.allegedConditions) lines.push(`  - ${c.asPrinted || c.description}`);
  }
  if (r.citedAuthorities.length) {
    lines.push("", "Authorities cited on the document:");
    for (const a of r.citedAuthorities) lines.push(`  - ${a.asPrinted || a.citation}`);
  }
  if (r.appealRights.mentioned && r.appealRights.asPrinted) {
    lines.push("", `Appeal rights language: ${r.appealRights.asPrinted}`);
  } else {
    lines.push("", "Appeal rights: no appeal or review language was located on this document.");
  }
  if (r.agencyContact.name || r.agencyContact.address) {
    lines.push(
      "",
      `Agency contact: ${[r.agencyContact.name, r.agencyContact.address, r.agencyContact.phone]
        .filter(Boolean)
        .join(" · ")}`,
    );
  }
  if (r.humanReviewNeeded.length) {
    lines.push("", "Flagged for human review:");
    for (const h of r.humanReviewNeeded) lines.push(`  - ${h}`);
  }
  if (r.otherObservations.length) {
    lines.push("", "Other observations:");
    for (const o of r.otherObservations) lines.push(`  - ${o}`);
  }

  return lines.join("\n");
}
