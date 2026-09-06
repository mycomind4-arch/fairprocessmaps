/**
 * Groups the raw files out of an expanded ZIP into proposed documents.
 *
 * `IMG_4471.jpg … IMG_4488.jpg` might be six pages of one abatement order, or
 * six separate notices a phone happened to number in sequence. Get it wrong
 * either way: merge two notices and a service date disappears into the
 * middle of a false multi-page document; split one notice into six and the
 * timeline gets six bogus events with no real dates of their own.
 *
 * Three signals feed the proposal, in the order they're trusted:
 *
 *   1. Filename heuristics (this module, no model calls) — an explicit page
 *      marker beats a folder path beats a bare numeric sequence.
 *   2. A cheap model pass (`cheapClassifyDocuments`) — reads only enough of
 *      each file to name its document type and any "Page 2 of 5" marker.
 *      Used to split a heuristic group the filenames got wrong, or to
 *      confirm one they got right.
 *   3. A person, in the review UI — nothing here is committed. Every group
 *      this module proposes is confirmed or corrected before a single full
 *      read happens.
 *
 * Nothing in this module writes to storage or the database; it operates
 * entirely on the candidate list the caller assembles from expand-zip's
 * output (or from evidence rows generally — grouping isn't ZIP-specific).
 */

import {
  callClaude,
  callClaudeDocuments,
  type ClaudeBindingEnv,
  type ClaudeDocument,
} from "@/lib/claude";
import { routeDocument, isTextual } from "./document-router";

export interface GroupingCandidate {
  evidenceId: string;
  /** Basename, e.g. "IMG_4471.jpg". */
  fileName: string;
  /** Sanitized full path inside the archive, e.g. "abatement-order/img1.jpg".
   * Null for evidence that did not come from a ZIP. */
  zipPath: string | null;
}

export type GroupConfidence = "high" | "medium" | "low";

export interface ProposedGroup {
  evidenceIds: string[];
  confidence: GroupConfidence;
  /** Plain-language reason shown in the review UI — why these files were
   * proposed together (or alone). */
  reason: string;
}

// ── Filename parsing helpers ─────────────────────────────────────────────────

function splitExt(fileName: string): { stem: string; ext: string } {
  const idx = fileName.lastIndexOf(".");
  if (idx <= 0) return { stem: fileName, ext: "" };
  return { stem: fileName.slice(0, idx), ext: fileName.slice(idx + 1).toLowerCase() };
}

function folderOf(zipPath: string | null): string | null {
  if (!zipPath) return null;
  const idx = zipPath.lastIndexOf("/");
  return idx === -1 ? null : zipPath.slice(0, idx);
}

/** "abatement_order_page2" -> { stem: "abatement_order", page: 2 }. */
const PAGE_MARKER = /^(.*?)[\s_.\-]*(?:page|pg|p)[\s_.\-]?0*(\d{1,3})$/i;

function parsePageMarker(stem: string): { stem: string; page: number } | null {
  const m = PAGE_MARKER.exec(stem.trim());
  if (!m) return null;
  const base = m[1].replace(/[\s_.\-]+$/, "");
  return { stem: base.toLowerCase(), page: parseInt(m[2], 10) };
}

/** "IMG_4471" -> { prefix: "img_", num: 4471 }. */
const NUMERIC_SEQUENCE = /^(.*?)[\s_.\-]*0*(\d{1,6})$/;

function parseNumericSequence(stem: string): { prefix: string; num: number } | null {
  const m = NUMERIC_SEQUENCE.exec(stem.trim());
  if (!m) return null;
  return { prefix: m[1].toLowerCase(), num: parseInt(m[2], 10) };
}

// ── Heuristic grouping ────────────────────────────────────────────────────────

/**
 * Propose groups from filenames and archive folder structure alone — no
 * model calls, fast enough to run on every file the moment a ZIP is expanded.
 *
 * Order of trust: explicit page markers, then shared folders, then bare
 * numeric sequences, then "nothing suggests grouping this with anything."
 * Each file is claimed by exactly one group.
 */
export function proposeDocumentGroups(candidates: GroupingCandidate[]): ProposedGroup[] {
  const groups: ProposedGroup[] = [];
  const claimed = new Set<string>();

  // Pass 1 — explicit page markers ("page 2", "p3"), keyed by folder + stem.
  // The strongest signal: someone (or some scanner) said in words that this
  // is a page of a larger thing.
  const pageBuckets = new Map<string, { evidenceId: string; page: number }[]>();
  for (const c of candidates) {
    const { stem } = splitExt(c.fileName);
    const marker = parsePageMarker(stem);
    if (!marker) continue;
    const key = `${folderOf(c.zipPath) ?? ""}::${marker.stem}`;
    (pageBuckets.get(key) ?? pageBuckets.set(key, []).get(key)!).push({
      evidenceId: c.evidenceId,
      page: marker.page,
    });
  }
  for (const [key, items] of pageBuckets) {
    if (items.length < 2) continue; // a lone "page1" isn't evidence of anything
    items.sort((a, b) => a.page - b.page);
    const ids = items.map((i) => i.evidenceId);
    ids.forEach((id) => claimed.add(id));
    const folder = key.split("::")[0];
    groups.push({
      evidenceIds: ids,
      confidence: "high",
      reason:
        `Filenames carry explicit page markers (page ${items[0].page}–${items[items.length - 1].page}) ` +
        `sharing the same name${folder ? ` in "${folder}"` : ""}.`,
    });
  }

  // Pass 2 — shared archive folder, for anything page markers didn't claim.
  // A ZIP built by dragging one folder per document into an archiver is one
  // of the most reliable signals available, short of the model reading it.
  const folderBuckets = new Map<string, GroupingCandidate[]>();
  for (const c of candidates) {
    if (claimed.has(c.evidenceId)) continue;
    const folder = folderOf(c.zipPath);
    if (!folder) continue;
    (folderBuckets.get(folder) ?? folderBuckets.set(folder, []).get(folder)!).push(c);
  }
  for (const [folder, items] of folderBuckets) {
    if (items.length < 2) continue;
    const ids = items.map((i) => i.evidenceId);
    ids.forEach((id) => claimed.add(id));
    groups.push({
      evidenceIds: ids,
      confidence: "medium",
      reason: `These ${items.length} files were stored together in the folder "${folder}" inside the archive.`,
    });
  }

  // Pass 3 — bare numeric sequences among what's left ("IMG_4471.jpg" ..
  // "IMG_4488.jpg"). Weakest signal: a phone numbers every photo it takes,
  // whether or not they belong to the same document, so this only proposes
  // a merge across a consecutive run and flags it low-confidence.
  const seqBuckets = new Map<string, { evidenceId: string; num: number }[]>();
  for (const c of candidates) {
    if (claimed.has(c.evidenceId)) continue;
    const { stem, ext } = splitExt(c.fileName);
    const seq = parseNumericSequence(stem);
    if (!seq) continue;
    const key = `${folderOf(c.zipPath) ?? ""}::${seq.prefix}::${ext}`;
    (seqBuckets.get(key) ?? seqBuckets.set(key, []).get(key)!).push({
      evidenceId: c.evidenceId,
      num: seq.num,
    });
  }
  for (const items of seqBuckets.values()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.num - b.num);

    let run: { evidenceId: string; num: number }[] = [items[0]];
    const flushRun = () => {
      if (run.length >= 2) {
        const ids = run.map((i) => i.evidenceId);
        ids.forEach((id) => claimed.add(id));
        groups.push({
          evidenceIds: ids,
          confidence: "low",
          reason:
            `Consecutive numbered filenames (${run[0].num}–${run[run.length - 1].num}) — this may be ` +
            `one multi-page document, or several separate files that happen to be numbered in sequence. ` +
            `Confirm before relying on this grouping.`,
        });
      }
    };
    for (let i = 1; i < items.length; i++) {
      if (items[i].num - items[i - 1].num <= 1) {
        run.push(items[i]);
      } else {
        flushRun();
        run = [items[i]];
      }
    }
    flushRun();
  }

  // Pass 4 — whatever's left is its own document. Nothing suggested merging
  // it with anything, so that's a high-confidence proposal, not a low one.
  for (const c of candidates) {
    if (claimed.has(c.evidenceId)) continue;
    claimed.add(c.evidenceId);
    groups.push({
      evidenceIds: [c.evidenceId],
      confidence: "high",
      reason: "No other file in this bundle shares its name pattern or folder.",
    });
  }

  return groups;
}

// ── Cheap model pass ──────────────────────────────────────────────────────────

export interface CheapClassification {
  evidenceId: string;
  documentType: string | null;
  pageMarker: { page: number | null; ofTotal: number | null };
  note: string | null;
}

const CHEAP_SYSTEM = `You do a fast first pass over one file from a code-enforcement case bundle,
before it is read in full. Answer only what is asked — this is a triage step,
not a transcription.

Look at the document type and any explicit page marker ("Page 2 of 5", "p. 3").
Do not transcribe body text, dates, names, or any other field.

Respond with ONLY a JSON object, no prose, no markdown fence:
{
  "documentType": one of "inspection_report" | "notice_of_violation" |
    "notice_of_abatement" | "compliance_order" | "notice_of_hearing" |
    "final_finding_and_order" | "administrative_citation" |
    "civil_penalty_notice" | "lien_notice" | "permit_denial" |
    "correspondence" | "other" | null if you cannot tell,
  "page": the page number printed on the document, or null,
  "ofTotal": the total page count if the document states one (e.g. "of 5"), or null,
  "note": one short sentence on anything ambiguous, or null
}`;

/**
 * Classify the first page of each file with a small, cheap call — document
 * type plus any printed page marker, nothing else. Used to correct filename
 * heuristics the review UI would otherwise have to fix by hand for every
 * ambiguous group.
 *
 * Callers must gate this behind the cost estimate and an explicit user
 * confirmation (see docs on `estimateIntakeCost`) — it is still a model call
 * per file, just a small one.
 */
export async function cheapClassifyDocuments(
  env: ClaudeBindingEnv,
  files: { evidenceId: string; data: Uint8Array; contentType: string; fileName: string }[],
): Promise<CheapClassification[]> {
  const results: CheapClassification[] = [];

  for (const f of files) {
    try {
      const routed = await routeDocument(f.data, f.contentType, f.fileName);
      if (routed.kind === "unsupported") {
        results.push({
          evidenceId: f.evidenceId,
          documentType: null,
          pageMarker: { page: null, ofTotal: null },
          note: routed.reason ?? "Could not be read.",
        });
        continue;
      }

      const raw = isTextual(routed)
        ? await callClaude(env, {
            system: CHEAP_SYSTEM,
            user: `--- BEGIN DOCUMENT TEXT ---\n${routed.text.slice(0, 8000)}\n--- END DOCUMENT TEXT ---`,
            maxTokens: 200,
          })
        : await callClaudeDocuments(env, {
            system: CHEAP_SYSTEM,
            documents: [routed.claudeDocument as ClaudeDocument],
            user: "Classify this document.",
            maxTokens: 200,
          });

      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      results.push({
        evidenceId: f.evidenceId,
        documentType: typeof parsed.documentType === "string" ? parsed.documentType : null,
        pageMarker: {
          page: typeof parsed.page === "number" ? parsed.page : null,
          ofTotal: typeof parsed.ofTotal === "number" ? parsed.ofTotal : null,
        },
        note: typeof parsed.note === "string" ? parsed.note : null,
      });
    } catch (err) {
      results.push({
        evidenceId: f.evidenceId,
        documentType: null,
        pageMarker: { page: null, ofTotal: null },
        note: `Could not classify: ${String(err)}`,
      });
    }
  }

  return results;
}

/**
 * Correct the filename-based groups using the cheap pass's document types.
 *
 * If the model disagrees with the filename heuristic — different files in
 * one proposed group read as different document types — split the group
 * rather than forcing a merge the model itself doubts. If everything in a
 * group carries an explicit page marker, that confirms the merge outright.
 */
export function refineGroupsWithCheapReads(
  groups: ProposedGroup[],
  reads: CheapClassification[],
): ProposedGroup[] {
  const byId = new Map(reads.map((r) => [r.evidenceId, r]));
  const refined: ProposedGroup[] = [];

  for (const group of groups) {
    if (group.evidenceIds.length === 1) {
      refined.push(group);
      continue;
    }

    const rows = group.evidenceIds.map((id) => byId.get(id));
    const types = new Set(rows.filter((r) => r?.documentType).map((r) => r!.documentType));

    if (types.size > 1) {
      const byType = new Map<string, string[]>();
      group.evidenceIds.forEach((id, i) => {
        const t = rows[i]?.documentType ?? "other";
        (byType.get(t) ?? byType.set(t, []).get(t)!).push(id);
      });
      for (const [t, ids] of byType) {
        refined.push({
          evidenceIds: ids,
          confidence: ids.length > 1 ? "medium" : "high",
          reason: `A first-page read reports ${ids.length > 1 ? "these" : "this"} as "${t.replace(/_/g, " ")}", separating ${ids.length > 1 ? "them" : "it"} from the rest of the filename-based group.`,
        });
      }
      continue;
    }

    const allHavePageMarkers = rows.every((r) => r?.pageMarker.page != null);
    refined.push(
      allHavePageMarkers
        ? {
            ...group,
            confidence: "high",
            reason: `${group.reason} Confirmed by explicit page markers read from the documents themselves.`,
          }
        : group,
    );
  }

  return refined;
}

// ── Cost estimate ─────────────────────────────────────────────────────────────

export interface CostEstimate {
  documentCount: number;
  groupCount: number;
  cheapPassCalls: number;
  fullReadCalls: number;
  approxInputTokens: number;
  approxOutputTokens: number;
  approxUsd: number;
  note: string;
}

// Deliberately conservative, deliberately rough. These drive a ballpark shown
// to the user before spending anything real — not a billing quote. Actual
// usage depends on document length, image resolution, and which model is
// configured (see ANTHROPIC_MODEL). Recalibrate if that changes materially.
const CHEAP_PASS_INPUT_TOKENS = 1200;
const CHEAP_PASS_OUTPUT_TOKENS = 120;
const FULL_READ_INPUT_TOKENS = 1500;
const FULL_READ_OUTPUT_TOKENS = 900;
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

/**
 * Estimate cost before any model call. `candidateCount` is every raw file
 * (each gets a cheap classification pass); `groupCount` is the number of
 * documents after grouping (each gets one full read).
 */
export function estimateIntakeCost(candidateCount: number, groupCount: number): CostEstimate {
  const approxInputTokens =
    candidateCount * CHEAP_PASS_INPUT_TOKENS + groupCount * FULL_READ_INPUT_TOKENS;
  const approxOutputTokens =
    candidateCount * CHEAP_PASS_OUTPUT_TOKENS + groupCount * FULL_READ_OUTPUT_TOKENS;
  const approxUsd =
    (approxInputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (approxOutputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;

  return {
    documentCount: candidateCount,
    groupCount,
    cheapPassCalls: candidateCount,
    fullReadCalls: groupCount,
    approxInputTokens,
    approxOutputTokens,
    approxUsd: Math.round(approxUsd * 100) / 100,
    note: "Rough estimate based on file count, not file content — a ballpark for deciding whether to proceed, not a bill.",
  };
}
