/**
 * Procedural Integrity Report.
 *
 * This is the artifact someone pays for, and it is deliberately not the brief
 * generator. A brief argues. This reports.
 *
 * Three properties make it worth more than a screenshot of the findings panel:
 *
 *   Complete. Every checkpoint appears, including the ones that were satisfied
 *   and the ones that could not be evaluated. A report that shows only adverse
 *   findings is advocacy wearing an audit's clothes, and opposing counsel will
 *   say so. Showing what passed is what makes what failed credible.
 *
 *   Cited. Every statement traces to an authority with a URL the reader can
 *   open. Nothing is asserted on the software's say-so.
 *
 *   Reproducible. The report carries a receipt — a hash of the exact inputs
 *   plus the policy version — so the same case file and the same pack version
 *   regenerate the same report, and any divergence is detectable.
 *
 * No LLM runs here. Generation is deterministic so two runs of the same inputs
 * are byte-identical apart from the timestamp.
 */

import { evaluatePack, type EvaluationInput } from "@/lib/policy/evaluate";
import {
  STATUS_DESCRIPTIONS,
  STATUS_LABELS,
  type PolicyPack,
  type RuleEvaluation,
  type RuleStatus,
} from "@/lib/policy/types";

export interface ReportCase {
  caseId: string;
  caseName: string;
  apn: string | null;
  address: string | null;
  county: string | null;
  caseType: string | null;
  openedAt: string | null;
}

export interface ReportEvidence {
  id: string;
  title: string | null;
  docType: string | null;
  source: string | null;
  sha256: string | null;
  uploadedAt: string | null;
}

export interface IntegrityReportInput {
  case: ReportCase;
  pack: PolicyPack;
  evaluation: EvaluationInput;
  evidenceIndex: ReportEvidence[];
  /** Who ran the report. Recorded, never inferred. */
  preparedBy: string;
  /** Injected so output is testable and the receipt is honest. */
  generatedAt?: string;
}

export interface IntegrityReport {
  markdown: string;
  receipt: ReportReceipt;
  /** False when the governing pack has not cleared legal review. */
  exportable: boolean;
  counts: Record<RuleStatus, number>;
}

export interface ReportReceipt {
  inputHash: string;
  policyPack: string;
  policyVersion: string;
  packActivation: string;
  checkpointCount: number;
  evidenceCount: number;
  generatedAt: string;
  preparedBy: string;
}

// ── Reproducibility receipt ─────────────────────────────────────────────────

/**
 * Hash the inputs that determine the report's content.
 *
 * Deliberately excludes the timestamp and the preparer: the same case file
 * evaluated under the same pack must hash identically no matter who runs it or
 * when. That is what makes the hash useful as a verification handle.
 */
export async function computeInputHash(input: IntegrityReportInput): Promise<string> {
  const canonical = JSON.stringify({
    case: input.case,
    packId: input.pack.id,
    packVersion: input.pack.policyVersion,
    // Sorted so timeline ordering from the DB cannot change the hash.
    timeline: [...input.evaluation.timeline]
      .map((e) => ({
        d: e.event_date,
        t: e.event_type,
        ev: e.evidence_id ?? null,
      }))
      .sort((a, b) => `${a.d}${a.t}${a.ev}`.localeCompare(`${b.d}${b.t}${b.ev}`)),
    evidence: [...input.evidenceIndex]
      .map((e) => ({ id: e.id, sha: e.sha256 }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Formatting helpers ──────────────────────────────────────────────────────

const STATUS_ORDER: RuleStatus[] = [
  "Observed",
  "NotLocated",
  "InsufficientEvidence",
  "AwaitingTrigger",
  "Satisfied",
];

function groupByStatus(evaluations: RuleEvaluation[]): Map<RuleStatus, RuleEvaluation[]> {
  const groups = new Map<RuleStatus, RuleEvaluation[]>();
  for (const status of STATUS_ORDER) groups.set(status, []);
  for (const e of evaluations) groups.get(e.status)!.push(e);
  return groups;
}

/** Deduplicate authorities while preserving first-appearance order. */
function authorityIndex(evaluations: RuleEvaluation[]) {
  const seen = new Map<string, { citation: string; authority: string; sourceUrl: string }>();
  for (const e of evaluations) {
    if (!seen.has(e.citation)) {
      seen.set(e.citation, {
        citation: e.citation,
        authority: e.authority,
        sourceUrl: e.sourceUrl,
      });
    }
  }
  return [...seen.values()];
}

function checkpointBlock(e: RuleEvaluation): string {
  const lines = [
    `#### ${e.ruleName}`,
    "",
    `**Result:** ${STATUS_LABELS[e.status]}`,
    "",
    e.detail,
    "",
    `**Authority relied on:** ${e.citation}`,
    `**Issued by:** ${e.authority}`,
    `**Source:** ${e.sourceUrl}`,
  ];
  if (e.recommendedNextAction) {
    lines.push("", `**Suggested next step:** ${e.recommendedNextAction}`);
  }
  return lines.join("\n");
}

// ── Report generation ───────────────────────────────────────────────────────

export async function generateIntegrityReport(
  input: IntegrityReportInput,
): Promise<IntegrityReport> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const evaluations = evaluatePack(input.pack, input.evaluation);
  const groups = groupByStatus(evaluations);
  const activated = input.pack.activationStatus === "active";
  const inputHash = await computeInputHash(input);

  const counts = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, groups.get(s)!.length]),
  ) as Record<RuleStatus, number>;

  const c = input.case;
  const parts: string[] = [];

  // ── Header ──
  parts.push("# Procedural Integrity Report");
  parts.push("");

  if (!activated) {
    parts.push(
      "> **DRAFT — NOT FOR FILING.** The policy pack governing this analysis has",
      "> not completed legal review. Day counts and cited authorities in this",
      "> report are unverified. It is a working document for counsel, not a",
      "> record suitable for submission.",
      "",
    );
  }

  parts.push(`**Case:** ${c.caseName}`);
  if (c.apn) parts.push(`**Assessor Parcel Number:** ${c.apn}`);
  if (c.address) parts.push(`**Property:** ${c.address}`);
  if (c.county) parts.push(`**Jurisdiction:** ${c.county}`);
  if (c.caseType) parts.push(`**Matter type:** ${c.caseType.replace(/_/g, " ")}`);
  parts.push(`**Prepared by:** ${input.preparedBy}`);
  parts.push(`**Generated:** ${generatedAt}`);
  parts.push("");

  // ── What this is and is not ──
  parts.push("## Scope and limitations");
  parts.push("");
  parts.push(
    "This report describes what the records in this case file show when measured",
    "against the procedural checkpoints listed below. It does not determine whether",
    "any law was broken, whether any agency acted improperly, or whether any claim",
    "would succeed. Those are legal conclusions requiring a qualified human.",
    "",
    "Three limits apply to everything that follows:",
    "",
    "1. **The analysis sees only what is in the case file.** A record reported as",
    "   *not located* is absent from the documents gathered here. It is not",
    "   evidence that the record does not exist.",
    "2. **Document text is machine-extracted.** Where extraction is incomplete or",
    "   absent, the checkpoint reports insufficient evidence rather than drawing",
    "   an inference from silence.",
    "3. **Checkpoints are jurisdiction-specific and versioned.** They reflect the",
    `   policy pack \`${input.pack.id}\` at version \`${input.pack.policyVersion}\`.`,
    "   Amendments to the underlying authorities after that version are not",
    "   reflected here.",
    "",
  );

  // ── Summary ──
  parts.push("## Summary of results");
  parts.push("");
  parts.push("| Result | Count | Meaning |");
  parts.push("|---|---:|---|");
  for (const status of STATUS_ORDER) {
    parts.push(
      `| ${STATUS_LABELS[status]} | ${counts[status]} | ${STATUS_DESCRIPTIONS[status]} |`,
    );
  }
  parts.push("");
  parts.push(
    `${evaluations.length} checkpoint${evaluations.length === 1 ? "" : "s"} evaluated ` +
      `against ${input.pack.jurisdiction}.`,
  );
  parts.push("");

  // ── Findings by status, complete ──
  parts.push("## Checkpoint results");
  parts.push("");
  parts.push(
    "All checkpoints are listed, including those the records satisfy and those",
    "that do not yet apply. A partial listing would not be an audit.",
    "",
  );

  for (const status of STATUS_ORDER) {
    const items = groups.get(status)!;
    if (items.length === 0) continue;
    parts.push(`### ${STATUS_LABELS[status]} (${items.length})`);
    parts.push("");
    parts.push(`_${STATUS_DESCRIPTIONS[status]}_`);
    parts.push("");
    for (const e of items) {
      parts.push(checkpointBlock(e));
      parts.push("");
    }
  }

  // ── Authorities ──
  const authorities = authorityIndex(evaluations);
  parts.push("## Authorities relied on");
  parts.push("");
  parts.push("| Citation | Issued by | Source |");
  parts.push("|---|---|---|");
  for (const a of authorities) {
    parts.push(`| ${a.citation} | ${a.authority} | ${a.sourceUrl} |`);
  }
  parts.push("");

  if (!activated) {
    const unverified = input.pack.rules.filter((r) =>
      (r.notes ?? "").toUpperCase().includes("UNVERIFIED"),
    );
    if (unverified.length > 0) {
      parts.push("### Checkpoints with unverified parameters");
      parts.push("");
      parts.push(
        "The following checkpoints carry values that have not been confirmed",
        "against currently codified text. Confirm each before relying on it.",
        "",
      );
      for (const r of unverified) {
        parts.push(`- **${r.name}** (${r.citation}) — ${r.notes}`);
      }
      parts.push("");
    }
  }

  // ── Evidence index ──
  parts.push("## Evidence index");
  parts.push("");
  if (input.evidenceIndex.length === 0) {
    parts.push("_No documents have been added to this case file._");
  } else {
    parts.push("| Document | Type | Source | SHA-256 | Added |");
    parts.push("|---|---|---|---|---|");
    for (const e of input.evidenceIndex) {
      parts.push(
        `| ${e.title ?? e.id} | ${e.docType ?? "—"} | ${e.source ?? "—"} | ` +
          `${e.sha256 ? `\`${e.sha256.slice(0, 16)}…\`` : "not hashed"} | ${e.uploadedAt ?? "—"} |`,
      );
    }
  }
  parts.push("");

  // ── Timeline ──
  parts.push("## Timeline as analyzed");
  parts.push("");
  parts.push(
    "These are the dated events the checkpoints were measured against. Events",
    "derived from county records appear alongside events entered by hand.",
    "",
  );
  const sorted = [...input.evaluation.timeline].sort((a, b) =>
    a.event_date.localeCompare(b.event_date),
  );
  if (sorted.length === 0) {
    parts.push("_No events are recorded in this case file._");
  } else {
    parts.push("| Date | Event | Description |");
    parts.push("|---|---|---|");
    for (const e of sorted) {
      parts.push(
        `| ${e.event_date} | ${e.event_type} | ${e.description ?? "—"} |`,
      );
    }
  }
  parts.push("");

  // ── Receipt ──
  const receipt: ReportReceipt = {
    inputHash,
    policyPack: input.pack.id,
    policyVersion: input.pack.policyVersion,
    packActivation: input.pack.activationStatus,
    checkpointCount: evaluations.length,
    evidenceCount: input.evidenceIndex.length,
    generatedAt,
    preparedBy: input.preparedBy,
  };

  parts.push("## Reproducibility receipt");
  parts.push("");
  parts.push(
    "This report is generated deterministically. Re-running the same case file",
    "against the same policy version reproduces it exactly. The input hash covers",
    "the case identity, the timeline, the evidence hashes, and the policy version —",
    "so if any of those change, the hash changes.",
    "",
  );
  parts.push("```");
  parts.push(`input-hash:      ${receipt.inputHash}`);
  parts.push(`policy-pack:     ${receipt.policyPack}`);
  parts.push(`policy-version:  ${receipt.policyVersion}`);
  parts.push(`pack-activation: ${receipt.packActivation}`);
  parts.push(`checkpoints:     ${receipt.checkpointCount}`);
  parts.push(`documents:       ${receipt.evidenceCount}`);
  parts.push(`generated-at:    ${receipt.generatedAt}`);
  parts.push(`prepared-by:     ${receipt.preparedBy}`);
  parts.push("```");
  parts.push("");

  return {
    markdown: parts.join("\n"),
    receipt,
    exportable: activated,
    counts,
  };
}
