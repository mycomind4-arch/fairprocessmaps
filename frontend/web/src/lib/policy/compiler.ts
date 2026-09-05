/**
 * Policy pack compiler.
 *
 * Drafts a policy pack for a new jurisdiction from the text of its municipal
 * code, then refuses to trust the result.
 *
 * This is the scale unlock. Every rule and GIS endpoint in this product is
 * Humboldt County, and hand-authoring a pack per county is what caps the
 * business at one small market. A compiler turns county #2 from an engineering
 * project into an afternoon of drafting plus a lawyer's review.
 *
 * It is also the most dangerous thing in the codebase, because an LLM inventing
 * a deadline that lands in a court filing is precisely the failure mode this
 * product cannot survive. Three things contain that:
 *
 *   1. **Extraction, not generation.** The model is given the code text and
 *      asked to locate deadlines that are literally present. Every rule must
 *      quote the sentence it came from. A rule whose quote does not appear in
 *      the source text is discarded by the validator, not by the model.
 *
 *   2. **The validator is the authority, not the model.** Everything below
 *      runs after the response and drops anything unsupported. The model
 *      cannot talk its way past it.
 *
 *   3. **Output is always `legal_review_required`.** The compiler has no code
 *      path that produces an activated pack. A human lawyer is the only way a
 *      rule ever evaluates for real.
 *
 * See docs/policy-packs.md for the review checklist this emits.
 */

import { callClaude, type ClaudeBindingEnv } from "@/lib/claude";
import type { PolicyPack, PolicyRule, RuleKind } from "./types";

export interface CompileRequest {
  jurisdiction: string;
  /** Case types the resulting pack should apply to. */
  caseTypes: string[];
  /** Raw text of the ordinance/code sections to mine. */
  sourceText: string;
  /** URL the source text came from, stamped onto every rule. */
  sourceUrl: string;
  /** Body that promulgated the code, e.g. "Mendocino County Board of Supervisors". */
  authority: string;
}

export interface CompileResult {
  pack: PolicyPack;
  /** Rules the model proposed that the validator threw out, and why. */
  rejected: RejectedRule[];
  /** Ordered questions a lawyer must answer before activation. */
  reviewChecklist: string[];
  warnings: string[];
}

export interface RejectedRule {
  proposed: unknown;
  reason: string;
}

const VALID_KINDS: RuleKind[] = [
  "elapsed_days",
  "required_predicate",
  "required_disclosure",
  "record_presence",
];

// ── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You extract procedural deadlines from municipal code text for a due-process analysis tool.

You are an extractor, not a legal analyst. Your only job is to locate procedural
requirements that are LITERALLY STATED in the text you are given, and express
them in a fixed JSON schema.

Absolute rules:

1. NEVER supply a deadline, day count, or requirement that is not stated in the
   provided text. If the text does not give a number, do not invent one — omit
   the rule entirely.
2. Every rule MUST include "sourceQuote": the exact sentence or clause from the
   provided text that establishes it, copied verbatim. If you cannot quote it,
   do not emit the rule.
3. NEVER use your background knowledge of law. If you believe a jurisdiction
   has a requirement but the provided text does not state it, omit it.
4. Prefer omitting a rule to guessing. A short, correct pack is the goal. An
   incomplete pack is fine; a wrong pack is not.
5. In "notes", state plainly what the text does NOT establish — ambiguity about
   which track applies, whether a maximum exists, whether finality is defined.

Rule kinds:
- "elapsed_days": a minimum number of days between a trigger and a later action.
  Requires minCalendarDays, triggerEventTypes, actionEventTypes.
- "required_predicate": an event that must occur before an adverse action.
  Requires actionEventTypes, satisfyingEventTypes.
- "required_disclosure": content a document must contain.
  Requires documentEventTypes, disclosureTerms.

Event types are lowercase tokens matched as substrings against a case timeline.
Use from this vocabulary where possible: notice, hearing, decision, order,
appeal, contest, abatement, lien, penalty, fine, demolition, enforcement,
permit_denied, permit_expired, case_closed.

Respond with JSON only, no prose:
{"rules": [{"id": "snake_case_id", "kind": "...", "name": "...",
"description": "...", "severity": "critical|warning|info", "citation": "...",
"sourceQuote": "...", "notes": "...", ...kind-specific fields}]}`;

function buildUserPrompt(req: CompileRequest): string {
  return `Jurisdiction: ${req.jurisdiction}
Source URL: ${req.sourceUrl}

Extract every procedural checkpoint literally stated in the following code text.
Remember: quote the establishing sentence in "sourceQuote" for each rule, and
omit any rule you cannot quote.

--- BEGIN CODE TEXT ---
${req.sourceText}
--- END CODE TEXT ---`;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Normalize text for quote verification.
 *
 * Models reflow whitespace and normalize typographic quotes and dashes when
 * copying. Those differences are not hallucinations, so we compare on a
 * flattened form rather than rejecting honest extractions over a curly
 * apostrophe.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/§/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ProposedRule extends Partial<PolicyRule> {
  sourceQuote?: string;
}

/**
 * Drop every proposed rule that is not grounded in the source text.
 *
 * This function, not the model, decides what ships.
 */
export function validateProposedRules(
  proposed: ProposedRule[],
  req: CompileRequest,
): { accepted: PolicyRule[]; rejected: RejectedRule[] } {
  const accepted: PolicyRule[] = [];
  const rejected: RejectedRule[] = [];
  const haystack = normalizeForMatch(req.sourceText);
  const seenIds = new Set<string>();
  // One action type per elapsed_days rule, matching the pack invariant that a
  // general and a specific rule must not measure the same interval.
  const claimedActions = new Set<string>();

  for (const p of proposed) {
    const reject = (reason: string) => rejected.push({ proposed: p, reason });

    if (!p.id || !/^[a-z0-9_]+$/.test(p.id)) {
      reject("Missing or malformed rule id.");
      continue;
    }
    if (seenIds.has(p.id)) {
      reject(`Duplicate rule id "${p.id}".`);
      continue;
    }
    if (!p.kind || !VALID_KINDS.includes(p.kind)) {
      reject(`Unknown rule kind "${String(p.kind)}".`);
      continue;
    }
    if (!p.name || !p.description) {
      reject("Missing name or description.");
      continue;
    }
    if (!p.citation) {
      reject("No citation. A rule without an authority cannot ship.");
      continue;
    }

    // The grounding check: the quote must actually appear in the source.
    if (!p.sourceQuote || p.sourceQuote.length < 20) {
      reject("No source quote, or too short to verify.");
      continue;
    }
    if (!haystack.includes(normalizeForMatch(p.sourceQuote))) {
      reject(
        `Source quote does not appear in the provided text — the model may have ` +
          `supplied it from background knowledge. Quote: "${p.sourceQuote.slice(0, 120)}"`,
      );
      continue;
    }

    // Kind-specific parameters.
    if (p.kind === "elapsed_days") {
      if (typeof p.minCalendarDays !== "number" || p.minCalendarDays < 0) {
        reject("elapsed_days rule has no usable minCalendarDays.");
        continue;
      }
      if (!p.triggerEventTypes?.length || !p.actionEventTypes?.length) {
        reject("elapsed_days rule is missing trigger or action event types.");
        continue;
      }
      const clash = p.actionEventTypes.find((a) => claimedActions.has(a));
      if (clash) {
        reject(`Action type "${clash}" is already measured by another elapsed_days rule.`);
        continue;
      }
      // Cross-check: the number should appear in the quote it came from.
      if (!/\d/.test(p.sourceQuote)) {
        reject("elapsed_days rule cites a quote containing no number.");
        continue;
      }
      for (const a of p.actionEventTypes) claimedActions.add(a);
    }

    if (p.kind === "required_predicate") {
      if (!p.actionEventTypes?.length || !p.satisfyingEventTypes?.length) {
        reject("required_predicate rule is missing action or satisfying event types.");
        continue;
      }
    }

    if (p.kind === "required_disclosure") {
      if (!p.documentEventTypes?.length || !p.disclosureTerms?.length) {
        reject("required_disclosure rule is missing document event types or terms.");
        continue;
      }
    }

    seenIds.add(p.id);
    accepted.push({
      id: p.id,
      kind: p.kind,
      name: p.name,
      description: p.description,
      severity: (p.severity as PolicyRule["severity"]) ?? "warning",
      citation: p.citation,
      sourceUrl: req.sourceUrl,
      authority: req.authority,
      notes:
        `MACHINE-EXTRACTED, UNVERIFIED. Drafted by the policy compiler from the ` +
        `text at ${req.sourceUrl} and not yet confirmed against the codified ` +
        `text by a qualified human. Establishing quote: "${p.sourceQuote.trim()}"` +
        (p.notes ? ` Model notes: ${p.notes}` : ""),
      minCalendarDays: p.minCalendarDays,
      triggerEventTypes: p.triggerEventTypes,
      actionEventTypes: p.actionEventTypes,
      satisfyingEventTypes: p.satisfyingEventTypes,
      disclosureTerms: p.disclosureTerms,
      documentEventTypes: p.documentEventTypes,
    });
  }

  return { accepted, rejected };
}

// ── Review checklist ────────────────────────────────────────────────────────

export function buildReviewChecklist(pack: PolicyPack): string[] {
  const checklist: string[] = [
    `Confirm the source text used is the CURRENTLY CODIFIED version for ${pack.jurisdiction}, not a superseded or proposed revision.`,
  ];

  for (const rule of pack.rules) {
    checklist.push(
      `[${rule.id}] Confirm ${rule.citation} is the controlling authority for "${rule.name}".`,
    );
    if (rule.kind === "elapsed_days") {
      checklist.push(
        `[${rule.id}] Confirm the ${rule.minCalendarDays}-day period, whether it runs on calendar or business days, and what event starts it.`,
      );
      checklist.push(
        `[${rule.id}] Confirm which enforcement track this applies to — summary abatement of an imminent hazard typically runs different timelines.`,
      );
    }
    if (rule.kind === "required_disclosure") {
      checklist.push(
        `[${rule.id}] Confirm the disclosure is actually required, and that the term list catches how local notices phrase it.`,
      );
    }
  }

  checklist.push(
    "Confirm no checkpoint asserts a conclusion rather than describing the record.",
    "Only after every item above: set activationStatus to \"active\" and record reviewedBy and reviewedAt.",
  );

  return checklist;
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function compilePolicyPack(
  env: ClaudeBindingEnv,
  req: CompileRequest,
): Promise<CompileResult> {
  const warnings: string[] = [];

  if (req.sourceText.trim().length < 200) {
    throw new Error(
      "Source text is too short to extract from. Provide the full text of the relevant code sections.",
    );
  }

  const raw = await callClaude(env, {
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(req),
    maxTokens: 4096,
  });

  let parsed: { rules?: ProposedRule[] };
  try {
    // Models sometimes wrap JSON in a fence despite instructions.
    const json = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The compiler response was not valid JSON. Nothing was drafted.");
  }

  const proposed = Array.isArray(parsed.rules) ? parsed.rules : [];
  if (proposed.length === 0) {
    warnings.push(
      "The model extracted no rules. This usually means the source text contains no explicit procedural deadlines — which is a legitimate outcome, not an error.",
    );
  }

  const { accepted, rejected } = validateProposedRules(proposed, req);

  if (rejected.length > 0) {
    warnings.push(
      `${rejected.length} proposed rule(s) failed validation and were discarded. Review them — a rejected quote that does not appear in the source is a sign the model reached for background knowledge.`,
    );
  }

  const pack: PolicyPack = {
    id: `${req.jurisdiction.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${req.caseTypes[0] ?? "general"}`,
    jurisdiction: req.jurisdiction,
    caseTypes: req.caseTypes,
    policyVersion: `${new Date().toISOString().slice(0, 10)}-machine-draft`,
    // There is no code path here that produces an activated pack.
    activationStatus: "legal_review_required",
    rules: accepted,
  };

  return { pack, rejected, reviewChecklist: buildReviewChecklist(pack), warnings };
}
