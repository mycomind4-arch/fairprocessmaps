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

// ── Due-process analysis ──

export interface RuleDef {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export const RULES: Record<string, RuleDef> = {
  notice_timing: {
    id: "notice_timing",
    name: "Adequate Notice Period",
    description: "Property owner must receive notice at least 10 days before hearing/action",
    severity: "critical",
  },
  hearing_right: {
    id: "hearing_right",
    name: "Right to Hearing",
    description: "Owner must be offered an opportunity to contest before adverse action",
    severity: "critical",
  },
  appeal_pathway: {
    id: "appeal_pathway",
    name: "Appeal Pathway Available",
    description: "Decision must include information on how to appeal",
    severity: "warning",
  },
  abatement_without_notice: {
    id: "abatement_without_notice",
    name: "Abatement Without Notice",
    description: "Property was abated without proper notice or before the compliance period expired",
    severity: "critical",
  },
  permit_review_right: {
    id: "permit_review_right",
    name: "Permit Review Rights",
    description: "Permit was denied or expired without opportunity for review or appeal",
    severity: "warning",
  },
  ce_outcome_review: {
    id: "ce_outcome_review",
    name: "Code Enforcement Outcome Review",
    description: "Code enforcement case closed without recorded appeal opportunity",
    severity: "info",
  },
};

const NOTICE_MIN_DAYS = 10;

interface Finding {
  rule: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  evidence_id: string | null;
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

function analyzeProject(
  evidence: any[],
  timeline: any[],
  ceCases: any[] = [],
  permits: any[] = []
): { findings: Finding[]; score: number; summary: string } {
  const findings: Finding[] = [];

  // Rule 1: Notice timing
  const noticeEvents = timeline.filter((e) =>
    (e.event_type || "").toLowerCase().includes("notice")
  );
  const actionEvents = timeline.filter((e) => {
    const t = (e.event_type || "").toLowerCase();
    return ["hearing", "decision", "enforcement", "fine", "penalty", "lien", "demolition"].some((x) =>
      t.includes(x)
    );
  });

  for (const action of actionEvents) {
    const actionDate = new Date(action.event_date);
    if (isNaN(actionDate.getTime())) continue;

    const matchingNotices = noticeEvents.filter((n) => {
      const noticeDate = new Date(n.event_date);
      return !isNaN(noticeDate.getTime()) && noticeDate <= actionDate;
    });

    if (matchingNotices.length === 0) {
      findings.push({
        rule: "notice_timing",
        severity: "critical",
        detail: `No prior notice found before ${action.event_type} on ${action.event_date}`,
        evidence_id: action.evidence_id || null,
      });
    } else {
      const latestNotice = matchingNotices.reduce((latest, n) => {
        const d = new Date(n.event_date);
        return d > new Date(latest.event_date) ? n : latest;
      });
      const daysDiff = Math.floor(
        (actionDate.getTime() - new Date(latestNotice.event_date).getTime()) / 86400000
      );
      if (daysDiff < NOTICE_MIN_DAYS) {
        findings.push({
          rule: "notice_timing",
          severity: "warning",
          detail: `Only ${daysDiff} day(s) between notice and ${action.event_type} (minimum: ${NOTICE_MIN_DAYS})`,
          evidence_id: action.evidence_id || null,
        });
      }
    }
  }

  // Rule 2: Hearing right
  const hasHearing = timeline.some((e) =>
    (e.event_type || "").toLowerCase().includes("hearing")
  );
  const hasAdverseAction = timeline.some((e) => {
    const t = (e.event_type || "").toLowerCase();
    return ["fine", "penalty", "lien", "demolition", "eviction"].some((x) => t.includes(x));
  });

  if (hasAdverseAction && !hasHearing) {
    findings.push({
      rule: "hearing_right",
      severity: "critical",
      detail: "Adverse action taken without recorded hearing opportunity",
      evidence_id: null,
    });
  }

  // Rule 3: Appeal pathway — decisions should mention appeal rights
  const decisionEvents = timeline.filter((e) =>
    (e.event_type || "").toLowerCase().includes("decision")
  );
  for (const decision of decisionEvents) {
    if (!decision.evidence_id) continue;
    const ev = evidence.find((e) => e.id === decision.evidence_id);
    if (!ev) continue;
    const text = `${ev.extracted_text || ""} ${ev.ai_summary || ""}`.toLowerCase();
    if (!text.includes("appeal") && !text.includes("review")) {
      findings.push({
        rule: "appeal_pathway",
        severity: "warning",
        detail: `Decision on ${decision.event_date} does not mention appeal rights`,
        evidence_id: decision.evidence_id,
      });
    }
  }

  // Rule 4: Abatement without notice (from CE cases)
  for (const ce of ceCases) {
    if (ce.abatement_date) {
      if (!ce.notice_served_date) {
        findings.push({
          rule: "abatement_without_notice",
          severity: "critical",
          detail: `Property abated on ${ce.abatement_date} without recorded notice of violation`,
          evidence_id: null,
        });
      } else {
        const noticeDate = new Date(ce.notice_served_date);
        const abateDate = new Date(ce.abatement_date);
        if (!isNaN(noticeDate.getTime()) && !isNaN(abateDate.getTime())) {
          const daysDiff = Math.floor((abateDate.getTime() - noticeDate.getTime()) / 86400000);
          const minDays = ce.notice_period_days || 10;
          if (daysDiff < minDays) {
            findings.push({
              rule: "abatement_without_notice",
              severity: "critical",
              detail: `Abatement occurred ${daysDiff} days after notice (compliance period: ${minDays} days) — ${ce.case_number || ""}`,
              evidence_id: null,
            });
          }
        }
      }
      if (!ce.hearing_date) {
        findings.push({
          rule: "hearing_right",
          severity: "critical",
          detail: `Abatement on ${ce.abatement_date} without a recorded hearing — ${ce.case_number || ""}`,
          evidence_id: null,
        });
      }
    }

    if (ce.status === "closed" || ce.status === "abated") {
      if (!ce.appeal_filed && !ce.appeal_date && !ce.hearing_date) {
        findings.push({
          rule: "ce_outcome_review",
          severity: "info",
          detail: `Case ${ce.case_number || ""} closed without hearing or appeal on record`,
          evidence_id: null,
        });
      }
    }
  }

  // Rule 5: Permit review rights (from building permits)
  for (const permit of permits) {
    if (permit.permit_status === "denied" && !permit.finalized_date) {
      findings.push({
        rule: "permit_review_right",
        severity: "warning",
        detail: `Permit ${permit.permit_number || ""} denied without recorded review or appeal opportunity`,
        evidence_id: null,
      });
    }
    if (permit.permit_status === "expired" && !permit.issued_date) {
      findings.push({
        rule: "permit_review_right",
        severity: "warning",
        detail: `Permit ${permit.permit_number || ""} expired without being issued — no review opportunity recorded`,
        evidence_id: null,
      });
    }
  }

  // Calculate score
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  const score = Math.max(0, 100 - critical * 25 - warning * 10 - info * 3);

  const summary = `Analysis complete: ${findings.length} finding(s) — ${critical} critical, ${warning} warning, ${info} info.`;

  return { findings, score, summary };
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

  // P0-5: Resolve org_id for org-scoped queries
  const projectRow = await db
    .prepare("SELECT organization_id FROM projects WHERE id = ?")
    .bind(projectId)
    .first();
  const orgId = (projectRow?.organization_id as string) ?? "";

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

  const { findings, score, summary } = analyzeProject(evidence, timeline, ceCases, permits);

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
        `INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, evidence_id, missing_info, finding_fingerprint, organization_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
      ).bind(f.id, f.project_id, f.rule, f.rule_name, f.severity, f.detail, f.evidence_id, f.missing_info, f.fingerprint, f.org_id)
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
