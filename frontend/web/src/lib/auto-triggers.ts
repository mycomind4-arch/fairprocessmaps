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
export async function runAnalysis(projectId: string): Promise<{
  score: number;
  summary: string;
  findingsCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  findings: Finding[];
}> {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const evidenceResult = await db
    .prepare("SELECT id, extracted_text, ai_summary, title, source, doc_type FROM evidence WHERE project_id = ?")
    .bind(projectId)
    .all();

  const timelineResult = await db
    .prepare("SELECT id, event_date, event_type, description, evidence_id FROM timeline_events WHERE project_id = ? ORDER BY event_date ASC")
    .bind(projectId)
    .all();

  const ceResult = await db
    .prepare("SELECT * FROM code_enforcement_cases WHERE project_id = ?")
    .bind(projectId)
    .all();

  const permitsResult = await db
    .prepare("SELECT * FROM building_permits WHERE project_id = ?")
    .bind(projectId)
    .all();

  const evidence = evidenceResult.results ?? [];
  const timeline = timelineResult.results ?? [];
  const ceCases = ceResult.results ?? [];
  const permits = permitsResult.results ?? [];

  const { findings, score, summary } = analyzeProject(evidence, timeline, ceCases, permits);

  // Clear old findings
  await db.prepare("DELETE FROM due_process_findings WHERE project_id = ?").bind(projectId).run();

  // Insert new findings
  for (const finding of findings) {
    await db
      .prepare(
        `INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, evidence_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        projectId,
        finding.rule,
        RULES[finding.rule]?.name ?? finding.rule,
        finding.severity,
        finding.detail,
        finding.evidence_id
      )
      .run();
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
  };
}
