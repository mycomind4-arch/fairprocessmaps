/**
 * Stage executors for the notice-response workflow.
 *
 * Division of labour, which is the important part:
 *
 *   AI stages (classify, extract, draft) READ and PROPOSE. They never decide a
 *   deadline, never decide whether a checkpoint is met, and never send
 *   anything. Their output is explicitly marked as proposed and carries the
 *   confidence the model reported.
 *
 *   Deterministic stages (deadline, analyze, mail, prove) DECIDE and ACT. A
 *   deadline computed by a model would be a deadline nobody can verify, so the
 *   date comes from policy pack arithmetic and the model's extracted service
 *   date is only an input a human can correct.
 *
 * The model is therefore never on the critical path for anything that has to be
 * right. It is on the path for everything that has to be fast.
 */

import { callClaude, type ClaudeBindingEnv } from "@/lib/claude";
import { computeDeadlines, urgencyMessage } from "./deadlines";
import type { PolicyPack } from "@/lib/policy/types";
import type { StageResult } from "./types";
import type { StageContext } from "./engine";

// ── Shared helpers ──────────────────────────────────────────────────────────

function ok(
  stageId: StageResult["stageId"],
  summary: string,
  output?: Record<string, unknown>,
): StageResult {
  return { stageId, status: "complete", summary, output, startedAt: new Date().toISOString() };
}

function needsInput(
  stageId: StageResult["stageId"],
  reason: string,
  nextAction: string,
): StageResult {
  return {
    stageId,
    status: "blocked",
    summary: reason,
    blockedReason: reason,
    nextAction,
    startedAt: new Date().toISOString(),
  };
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(cleaned) as T;
}

/** Read a completed upstream stage's output. */
function upstream(ctx: StageContext, stageId: string): Record<string, unknown> | null {
  const r = ctx.priorResults.find(
    (x: StageResult) => x.stageId === stageId && x.status === "complete",
  );
  return (r?.output as Record<string, unknown>) ?? null;
}

// ── classify ────────────────────────────────────────────────────────────────

const CLASSIFY_SYSTEM = `You identify what kind of government notice a document is.

You are reading a notice someone received from a local agency. Report only what
the document says about itself. Do not infer legal consequences, do not assess
whether the notice is valid, and do not advise.

If the document does not clearly state something, use null. A null is far more
useful than a guess, because a wrong notice type produces a wrong deadline.

Respond with JSON only:
{"noticeType": "notice_of_violation|administrative_citation|abatement_order|code_enforcement_notice|permit_denial|hearing_notice|lien_notice|other|null",
 "issuingAgency": string|null,
 "jurisdiction": string|null,
 "statedResponseDeadline": "YYYY-MM-DD"|null,
 "statedResponseWindow": string|null,
 "confidence": "low"|"medium"|"high",
 "reasoning": string}`;

export function classifyStage(env: ClaudeBindingEnv, noticeText: string) {
  return async (ctx: StageContext): Promise<StageResult> => {
    if (!noticeText.trim()) {
      return needsInput(
        "classify",
        "The notice document has no extracted text, so it cannot be identified.",
        "Run text extraction on the uploaded notice, or enter the notice type by hand.",
      );
    }

    const raw = await callClaude(env, {
      system: CLASSIFY_SYSTEM,
      user: `Identify this notice.\n\n--- BEGIN NOTICE ---\n${noticeText.slice(0, 40000)}\n--- END NOTICE ---`,
      maxTokens: 1024,
    });

    const parsed = parseJson<{
      noticeType: string | null;
      issuingAgency: string | null;
      jurisdiction: string | null;
      statedResponseDeadline: string | null;
      statedResponseWindow: string | null;
      confidence: string;
      reasoning: string;
    }>(raw);

    if (!parsed.noticeType) {
      return needsInput(
        "classify",
        "The document does not clearly identify what kind of notice it is.",
        "Select the notice type by hand — every downstream deadline depends on it.",
      );
    }

    return ok(
      "classify",
      `Identified as ${parsed.noticeType.replace(/_/g, " ")}${
        parsed.issuingAgency ? ` from ${parsed.issuingAgency}` : ""
      } (${parsed.confidence} confidence, proposed — confirm before relying on it).`,
      { ...parsed, proposed: true },
    );
  };
}

// ── extract ─────────────────────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You extract facts from a government notice.

Extract ONLY what is literally stated. For every field, include the exact
sentence you took it from in the matching "_quote" field. If you cannot quote
it, the value is null.

Never infer a date. If the notice says "within 30 days" but gives no service
date, serviceDate is null — do not compute it.

Respond with JSON only:
{"serviceDate": "YYYY-MM-DD"|null, "serviceDate_quote": string|null,
 "caseNumber": string|null, "caseNumber_quote": string|null,
 "recipientName": string|null,
 "propertyAddress": string|null, "apn": string|null,
 "allegedConditions": [{"description": string, "quote": string}],
 "citedAuthorities": [{"citation": string, "quote": string}],
 "agencyContact": {"name": string|null, "address": string|null, "phone": string|null},
 "confidence": "low"|"medium"|"high"}`;

export function extractStage(env: ClaudeBindingEnv, noticeText: string) {
  return async (ctx: StageContext): Promise<StageResult> => {
    const raw = await callClaude(env, {
      system: EXTRACT_SYSTEM,
      user: `Extract the facts from this notice.\n\n--- BEGIN NOTICE ---\n${noticeText.slice(0, 40000)}\n--- END NOTICE ---`,
      maxTokens: 2048,
    });

    const parsed = parseJson<Record<string, unknown>>(raw);

    // Drop any field whose supporting quote is not actually in the document.
    // Same grounding discipline as the policy compiler: the model proposes, the
    // text decides.
    const haystack = noticeText.toLowerCase().replace(/\s+/g, " ");
    const ungrounded: string[] = [];
    for (const field of ["serviceDate", "caseNumber"]) {
      const quote = parsed[`${field}_quote`];
      if (parsed[field] && typeof quote === "string") {
        if (!haystack.includes(quote.toLowerCase().replace(/\s+/g, " ").trim())) {
          ungrounded.push(field);
          parsed[field] = null;
        }
      }
    }

    const serviceDate = (parsed.serviceDate as string) ?? null;

    return ok(
      "extract",
      serviceDate
        ? `Extracted a service date of ${serviceDate}${
            parsed.caseNumber ? ` and case number ${parsed.caseNumber}` : ""
          }.`
        : "No service date could be quoted from the notice. The response deadline cannot be computed until one is supplied.",
      {
        ...parsed,
        proposed: true,
        ungroundedFieldsDiscarded: ungrounded,
      },
    );
  };
}

// ── deadline (deterministic) ────────────────────────────────────────────────

export function deadlineStage(pack: PolicyPack) {
  return async (ctx: StageContext): Promise<StageResult> => {
    const extracted = upstream(ctx, "extract");
    const classified = upstream(ctx, "classify");

    const serviceDate = (extracted?.serviceDate as string) ?? null;
    const noticeType = (classified?.noticeType as string) ?? "notice";

    const deadlines = computeDeadlines({ serviceDate, noticeType, pack });
    const primary = deadlines[0];

    // A deadline the notice states itself outranks anything we calculate.
    const stated = (classified?.statedResponseDeadline as string) ?? null;

    return ok(
      "deadline",
      stated
        ? `The notice states a response date of ${stated}. Calculated window: ${primary.dueDate ?? "unknown"}. The stated date controls.`
        : urgencyMessage(primary),
      {
        deadlines,
        primary,
        statedDeadline: stated,
        // Surfaced so the UI can warn loudly when the two disagree.
        conflictsWithStated:
          Boolean(stated && primary.dueDate && stated !== primary.dueDate),
      },
    );
  };
}

// ── draft (AI, proposes only) ───────────────────────────────────────────────

const DRAFT_SYSTEM = `You draft a response letter to a government agency notice.

This letter is written by or for the notice recipient. Its purposes, in order:

1. Respond within the deadline, preserving the recipient's position.
2. Preserve objections rather than conceding anything. Never admit a condition
   exists, never accept a characterization, never agree a deadline was met.
3. Request the record — the file, the inspection reports, the service proof,
   the authority relied on.
4. Ask for the hearing or appeal the notice describes, if any.

Hard rules:
- Do NOT state legal conclusions or cite case law. You are not counsel.
- Do NOT admit facts. Where the agency alleges something, write "the notice
  alleges" — never "the property has".
- Do NOT invent dates, case numbers, or facts not supplied to you.
- Keep it under one page. Short letters get read.
- Write plainly. No legalese, no throat-clearing.

Respond with JSON only:
{"subject": string, "body": string, "openQuestions": string[]}`;

export function draftStage(env: ClaudeBindingEnv) {
  return async (ctx: StageContext): Promise<StageResult> => {
    const extracted = upstream(ctx, "extract") ?? {};
    const deadline = upstream(ctx, "deadline") ?? {};
    const classified = upstream(ctx, "classify") ?? {};

    const raw = await callClaude(env, {
      system: DRAFT_SYSTEM,
      user: `Draft a response.

NOTICE TYPE: ${classified.noticeType ?? "unknown"}
ISSUING AGENCY: ${classified.issuingAgency ?? "unknown"}
CASE NUMBER: ${extracted.caseNumber ?? "not stated"}
PROPERTY: ${extracted.propertyAddress ?? "not stated"}
SERVICE DATE: ${extracted.serviceDate ?? "not stated"}
RESPONSE DEADLINE: ${(deadline.primary as Record<string, unknown>)?.dueDate ?? "unknown"}

ALLEGED CONDITIONS (as stated by the agency, not admitted):
${JSON.stringify(extracted.allegedConditions ?? [], null, 2)}

AUTHORITIES THE NOTICE CITES:
${JSON.stringify(extracted.citedAuthorities ?? [], null, 2)}`,
      maxTokens: 2048,
    });

    const parsed = parseJson<{ subject: string; body: string; openQuestions: string[] }>(raw);

    return ok(
      "draft",
      `Drafted a response. ${parsed.openQuestions?.length ?? 0} open question(s) for the reviewer. This is a starting point — read and edit it before authorizing.`,
      { ...parsed, proposed: true },
    );
  };
}

// ── authorize (records that a human is ready) ───────────────────────────────
//
// The stage itself does nothing but mark that the draft is final. The actual
// authorization row is written by the authorize API route, and the gate in
// engine.ts is what enforces it. Keeping those separate means the gate cannot
// be satisfied by a stage executor.

export function authorizeStage(draftStageId: string = "draft") {
  return async (ctx: StageContext): Promise<StageResult> => {
    const draft = upstream(ctx, draftStageId);
    if (!draft?.body) {
      return needsInput(
        "authorize",
        "There is no draft to authorize.",
        "Generate or write a draft first.",
      );
    }
    return ok("authorize", "Draft is ready for human review and authorization.", {
      readyForAuthorization: true,
    });
  };
}

// ── Public records request drafting ─────────────────────────────────────────

const RECORDS_REQUEST_SYSTEM = `You draft a California Public Records Act request letter.

Purposes, in order:
1. Identify the records sought with enough specificity that the agency can
   locate them (case number, APN, address, date range, document types).
2. Cite the Public Records Act (Cal. Gov. Code § 7920.000 et seq.) as the basis
   for the request.
3. Ask the agency to confirm receipt and state when a response can be expected.
4. Ask, if any records are withheld, that the agency cite the specific
   statutory exemption relied upon, per Gov. Code § 7922.000.

Hard rules:
- Do NOT invent case numbers, dates, or facts not supplied to you.
- Do NOT state legal conclusions about whether prior requests were mishandled.
  A cover note may reference that this is a follow-up to prior requests, stated
  neutrally as fact ("this follows requests sent on the dates below"), never
  as an accusation.
- Keep it under one page.

Respond with JSON only:
{"subject": string, "body": string, "openQuestions": string[]}`;

export function draftRecordsRequestStage(env: ClaudeBindingEnv) {
  return async (ctx: StageContext): Promise<StageResult> => {
    const input = ctx.input ?? {};

    const raw = await callClaude(env, {
      system: RECORDS_REQUEST_SYSTEM,
      user: `Draft a Public Records Act request.

RECORDS SOUGHT: ${input.recordsSought ?? "not specified — ask the reviewer to supply this"}
CASE / MATTER REFERENCE: ${input.caseReference ?? "not stated"}
PROPERTY ADDRESS / APN: ${input.propertyReference ?? "not stated"}
PRIOR REQUESTS ALREADY SENT (dates, if any): ${JSON.stringify(input.priorRequestDates ?? [])}
RECIPIENT AGENCY: ${input.agency ?? "Humboldt County Code Enforcement Unit"}`,
      maxTokens: 1500,
    });

    const parsed = parseJson<{ subject: string; body: string; openQuestions: string[] }>(raw);

    return ok(
      "draft_request",
      `Drafted a records request. ${parsed.openQuestions?.length ?? 0} open question(s) for the reviewer.`,
      { ...parsed, proposed: true },
    );
  };
}

/**
 * Records the actual send — deterministic, driven entirely by what a human
 * supplies via the advance call's stageInput, since the workflow itself
 * cannot verify how a letter was actually delivered (mail, email, in person).
 * This stage does not itself write the timeline event; the API route does,
 * once this stage confirms the input is present, so the write happens in the
 * same place as every other case-data write in the app.
 */
export function logRecordsRequestSentStage() {
  return async (ctx: StageContext): Promise<StageResult> => {
    const input = ctx.input ?? {};
    const sentDate = input.sentDate as string | undefined;
    const method = (input.method as string | undefined) ?? "unspecified method";

    if (!sentDate) {
      return needsInput(
        "log_request",
        "No send date was supplied.",
        "Provide the date this request was actually sent (mailed, emailed, or delivered in person).",
      );
    }

    return ok(
      "log_request",
      `Recorded: records request sent ${sentDate} (${method}). This date is what the response-timing rule and the Deadline Bar will measure against.`,
      { sentDate, method, eventType: "records_request_sent" },
    );
  };
}

/** Records the response outcome — same pattern as logRecordsRequestSentStage. */
export function logRecordsResponseStage() {
  return async (ctx: StageContext): Promise<StageResult> => {
    const input = ctx.input ?? {};
    const responded = input.responded as boolean | undefined;

    if (responded === undefined) {
      return needsInput(
        "log_response",
        "No outcome was supplied yet.",
        "Once a response arrives, or once the response window has closed with none, record the outcome here.",
      );
    }

    if (responded) {
      const responseDate = input.responseDate as string | undefined;
      return ok(
        "log_response",
        `Recorded: response received${responseDate ? ` ${responseDate}` : ""}.`,
        { responded: true, responseDate, eventType: "records_response_received" },
      );
    }

    return ok(
      "log_response",
      "Recorded: no response received. This logged non-response is itself the finding the response-timing rule reads — not a gap awaiting more information.",
      { responded: false, eventType: null },
    );
  };
}
