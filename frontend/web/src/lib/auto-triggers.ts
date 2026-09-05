/**
 * Shared intelligence + analysis logic — callable from any API route
 * without needing to self-fetch. Extracted from the route handlers so
 * project creation can auto-trigger both inline.
 * 
 * UPDATED: runIntelligence now delegates to the multi-agent runRecon()
 * in recon-agents.ts for comprehensive property intelligence gathering.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runRecon } from "@/lib/recon-agents";

// ── Intelligence (delegates to multi-agent recon) ──

/**
 * Run property intelligence gathering for a project.
 * Now delegates to the full 12-agent recon system.
 * Kept for backward compatibility with existing API routes.
 */
export async function runIntelligence(projectId: string): Promise<{
  success: boolean;
  message: string;
  evidenceId?: string;
}> {
  const result = await runRecon(projectId, false);
  
  if (!result.success) {
    return { success: false, message: result.intelligenceSummary };
  }
  
  if (result.succeeded === 0 && result.agentCount === 0) {
    return { success: true, message: result.intelligenceSummary };
  }
  
  return {
    success: true,
    message: `recon complete: ${result.succeeded}/${result.agentCount} agents succeeded`,
    evidenceId: result.evidenceId,
  };
}

// ── Due-process analysis (policy-pack driven) ──
//
// Rules are no longer written here. They live in versioned, citation-anchored
// policy packs under ./policy/packs, are evaluated by ./policy/evaluate, and
// every finding carries the authority it rests on. See ./policy/types.ts for
// the neutral status vocabulary and why it matters.

import { evaluatePack, type EvaluationInput } from "@/lib/policy/evaluate";
import { eventsFromCodeEnforcement, eventsFromPermits } from "@/lib/policy/adapters";
import { resolvePack, defaultPack, ruleIndex } from "@/lib/policy/registry";
import {
  ACTIONABLE_STATUSES,
  type PolicyPack,
  type RuleEvaluation,
  type Severity,
} from "@/lib/policy/types";

export interface RuleDef {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  citation: string;
  sourceUrl: string;
  authority: string;
}

/**
 * Rule metadata by id, assembled from the registered packs.
 *
 * Kept as a named export because API routes and the brief generator import it
 * to label findings. It is now derived rather than hand-maintained.
 */
export const RULES: Record<string, RuleDef> = Object.fromEntries(
  Object.entries(ruleIndex()).map(([id, { rule }]) => [
    id,
    {
      id,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      citation: rule.citation,
      sourceUrl: rule.sourceUrl,
      authority: rule.authority,
    },
  ]),
);

interface Finding {
  rule: string;
  severity: Severity;
  detail: string;
  evidence_id: string | null;
  status: string;
  citation: string;
  source_url: string;
  authority: string;
  policy_version: string;
  provisional: boolean;
  recommended_action: string | null;
}

/**
 * Generate a stable fingerprint for a finding.
 * Same rule + same evidence + same detail = same fingerprint.
 * Used for upsert: if fingerprint matches, preserve existing status/reviews.
 */
function findingFingerprint(rule: string, evidenceId: string | null, detail: string): string {
  const input = `${rule}|${evidenceId ?? "none"}|${detail.slice(0, 200)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/** An evaluation becomes a persisted finding only if it is actionable. */
function toFinding(e: RuleEvaluation): Finding {
  return {
    rule: e.ruleId,
    severity: e.severity,
    detail: e.detail,
    evidence_id: e.evidenceId,
    status: e.status,
    citation: e.citation,
    source_url: e.sourceUrl,
    authority: e.authority,
    policy_version: e.policyVersion,
    provisional: e.provisional,
    recommended_action: e.recommendedNextAction ?? null,
  };
}

/**
 * Score the case file.
 *
 * This is a completeness signal, not a merit score: it reflects how many
 * checkpoints the available records leave open. `InsufficientEvidence` and
 * `NotLocated` weigh less than `Observed` because a gap in our copy of the
 * file is not the same as a condition in the record.
 */
function scoreEvaluations(evaluations: RuleEvaluation[]): number {
  let score = 100;
  for (const e of evaluations) {
    if (!ACTIONABLE_STATUSES.includes(e.status)) continue;
    const weight = e.status === "Observed" ? 1 : 0.4;
    const base = e.severity === "critical" ? 25 : e.severity === "warning" ? 10 : 3;
    score -= base * weight;
  }
  return Math.max(0, Math.round(score));
}

function analyzeProject(
  evidence: any[],
  timeline: any[],
  ceCases: any[] = [],
  permits: any[] = [],
  pack: PolicyPack = defaultPack(),
): {
  findings: Finding[];
  evaluations: RuleEvaluation[];
  score: number;
  summary: string;
} {
  // County records join the same event stream the user sees on the timeline.
  const input: EvaluationInput = {
    timeline: [
      ...timeline,
      ...eventsFromCodeEnforcement(ceCases),
      ...eventsFromPermits(permits),
    ],
    evidence,
  };

  const evaluations = evaluatePack(pack, input);
  const findings = evaluations
    .filter((e) => ACTIONABLE_STATUSES.includes(e.status))
    .map(toFinding);

  const score = scoreEvaluations(evaluations);

  const observed = findings.filter((f) => f.status === "Observed").length;
  const notLocated = findings.filter((f) => f.status === "NotLocated").length;
  const insufficient = findings.filter((f) => f.status === "InsufficientEvidence").length;
  const satisfied = evaluations.filter((e) => e.status === "Satisfied").length;

  const summary =
    `Reviewed ${evaluations.length} checkpoint(s) against ${pack.jurisdiction} ` +
    `(policy ${pack.policyVersion}): ${observed} observed in record, ` +
    `${notLocated} not located, ${insufficient} awaiting evidence, ${satisfied} satisfied.` +
    (pack.activationStatus !== "active"
      ? " This policy pack has not completed legal review; findings are provisional."
      : "");

  return { findings, evaluations, score, summary };
}

/**
 * Run due-process analysis for a project.
 * Evaluates timeline events against rules, writes findings, updates score.
 */
/**
 * Run due-process analysis for a project.
 * Evaluates timeline events against rules, writes findings, updates score.
 *
 * P0 FIX: Uses fingerprint-based upsert instead of destructive DELETE+INSERT.
 * - Existing findings with matching fingerprint keep their status/reviews.
 * - New findings are inserted with 'open' status.
 * - Findings that no longer apply are marked 'superseded' (not deleted).
 * - All queries are org-scoped to prevent cross-org data leaks.
 * - Multi-step writes use db.batch() for atomicity.
 */
export async function runAnalysis(projectId: string): Promise<{
  policyPack: string;
  policyVersion: string;
  jurisdiction: string;
  provisional: boolean;
  satisfiedCount: number;
  checkpointsEvaluated: number;
  score: number;
  summary: string;
  findingsCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  findings: Finding[];
  newFindingsCount: number;
  preservedCount: number;
  supersededCount: number;
}> {
  const { env } = getCloudflareContext();
  const db = env.DB;

  // P0-5: Resolve org_id for org-scoped queries. Jurisdiction selects the
  // policy pack; a case in a county we have no pack for produces no findings
  // rather than findings evaluated under the wrong county's rules.
  const projectRow = await db
    .prepare(
      `SELECT p.organization_id, p.case_type, pr.county, pr.city
       FROM projects p LEFT JOIN properties pr ON p.property_id = pr.id
       WHERE p.id = ?`,
    )
    .bind(projectId)
    .first();
  const orgId = (projectRow?.organization_id as string) ?? "";
  const jurisdiction = (projectRow?.county as string) ?? null;
  const caseType = (projectRow?.case_type as string) ?? null;

  // Fall back to the pilot pack for cases created before county was captured.
  const pack = resolvePack(jurisdiction, caseType) ?? defaultPack();

  // P0-5: All queries org-scoped
  const evidenceResult = await db
    .prepare("SELECT id, extracted_text, ai_summary, title, source, doc_type FROM evidence WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, orgId)
    .all();

  const timelineResult = await db
    .prepare("SELECT id, event_date, event_type, description, evidence_id FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date ASC")
    .bind(projectId, orgId)
    .all();

  const ceResult = await db
    .prepare("SELECT * FROM code_enforcement_cases WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, orgId)
    .all();

  const permitsResult = await db
    .prepare("SELECT * FROM building_permits WHERE project_id = ? AND organization_id = ?")
    .bind(projectId, orgId)
    .all();

  const evidence = evidenceResult.results ?? [];
  const timeline = timelineResult.results ?? [];
  const ceCases = ceResult.results ?? [];
  const permits = permitsResult.results ?? [];

  const { findings, evaluations, score, summary } = analyzeProject(
    evidence,
    timeline,
    ceCases,
    permits,
    pack,
  );

  // P0-1: Generate fingerprints for new findings
  const newFingerprints = new Set(
    findings.map(f => findingFingerprint(f.rule, f.evidence_id, f.detail))
  );

  // Fetch existing findings to compare
  const existingResult = await db
    .prepare("SELECT id, finding_fingerprint, status, reviewed_by, reviewed_at FROM due_process_findings WHERE project_id = ? AND organization_id = ? AND status != 'superseded'")
    .bind(projectId, orgId)
    .all();
  const existingFindings = existingResult.results ?? [];

  const existingByFingerprint = new Map(
    existingFindings.map((ef: any) => [ef.finding_fingerprint, ef])
  );

  // Categorize: preserve, insert, supersede
  const toInsert: any[] = [];
  const toSupersede: string[] = [];
  let preservedCount = 0;

  for (const finding of findings) {
    const fp = findingFingerprint(finding.rule, finding.evidence_id, finding.detail);
    const existing = existingByFingerprint.get(fp);
    if (existing) {
      // Finding already exists — preserve status, reviewed_by, reviewed_at
      preservedCount++;
      existingByFingerprint.delete(fp); // Remove from map; remaining = stale
    } else {
      // New finding — insert
      const isMissingInfo = (finding.detail?.toLowerCase().includes('missing') ?? false) ||
        (finding.detail?.toLowerCase().includes('not found') ?? false) ||
        (finding.detail?.toLowerCase().includes('absent') ?? false);
      toInsert.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        org_id: orgId,
        rule: finding.rule,
        rule_name: RULES[finding.rule]?.name ?? finding.rule,
        severity: finding.severity,
        detail: finding.detail,
        evidence_id: finding.evidence_id,
        missing_info: isMissingInfo ? 1 : 0,
        fingerprint: fp,
        rule_status: finding.status,
        citation: finding.citation,
        source_url: finding.source_url,
        authority: finding.authority,
        policy_version: finding.policy_version,
        policy_pack: pack.id,
        provisional: finding.provisional ? 1 : 0,
        recommended_action: finding.recommended_action,
      });
    }
  }

  // Remaining in existingByFingerprint are stale (no longer detected) → mark superseded
  for (const [fp, ef] of existingByFingerprint) {
    toSupersede.push((ef as any).id);
  }

  // P0-3: Use db.batch() for atomic writes

  // Insert new findings
  if (toInsert.length > 0) {
    const insertStmts = toInsert.map(f =>
      db.prepare(
        `INSERT INTO due_process_findings (
           id, project_id, rule, rule_name, severity, status, detail, evidence_id,
           missing_info, finding_fingerprint, organization_id,
           rule_status, citation, source_url, authority, policy_version, policy_pack,
           provisional, recommended_action
         )
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        f.id, f.project_id, f.rule, f.rule_name, f.severity, f.detail, f.evidence_id,
        f.missing_info, f.fingerprint, f.org_id,
        f.rule_status, f.citation, f.source_url, f.authority, f.policy_version, f.policy_pack,
        f.provisional, f.recommended_action,
      )
    );
    await db.batch(insertStmts);
  }

  // Mark stale findings as superseded (preserving their history)
  if (toSupersede.length > 0) {
    const supersedeStmts = toSupersede.map(id =>
      db.prepare("UPDATE due_process_findings SET status = 'superseded' WHERE id = ?")
        .bind(id)
    );
    await db.batch(supersedeStmts);
  }

  // Update project's due_process_score
  await db
    .prepare("UPDATE projects SET due_process_score = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(score, projectId)
    .run();

  return {
    policyPack: pack.id,
    policyVersion: pack.policyVersion,
    jurisdiction: pack.jurisdiction,
    provisional: pack.activationStatus !== "active",
    satisfiedCount: evaluations.filter((e) => e.status === "Satisfied").length,
    checkpointsEvaluated: evaluations.length,
    score,
    summary,
    findingsCount: findings.length,
    criticalCount: findings.filter((f) => f.severity === "critical").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
    findings,
    newFindingsCount: toInsert.length,
    preservedCount,
    supersededCount: toSupersede.length,
  };
}
