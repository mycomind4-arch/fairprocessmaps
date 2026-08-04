import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

// ── Rule definitions (ported from backend/api/src/services/due_process_analyzer.py) ──

interface Rule {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

const RULES: Record<string, Rule> = {
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
  record_access: {
    id: "record_access",
    name: "Public Record Accessibility",
    description: "Relevant records must be accessible via FOIA or public portal",
    severity: "warning",
  },
  consistent_application: {
    id: "consistent_application",
    name: "Consistent Application",
    description: "Enforcement actions should be consistent with prior similar cases",
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

function uuid(): string {
  return crypto.randomUUID();
}

// ── Core analysis logic ──

function analyzeProject(
  evidence: any[],
  timeline: any[]
): { findings: Finding[]; score: number; summary: string } {
  const findings: Finding[] = [];

  // Rule 1: Notice timing — check if notices precede actions by >= NOTICE_MIN_DAYS
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
          detail: `Only ${daysDiff} days between notice and action (minimum: ${NOTICE_MIN_DAYS})`,
          evidence_id: latestNotice.evidence_id || null,
        });
      }
    }
  }

  // Rule 2: Hearing right — adverse action without recorded hearing
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

  // Rule 4: Record access — check if any evidence is flagged as inaccessible
  // (future: check if key documents are missing from the timeline)

  // Calculate score
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - critical * 25 - warning * 10);

  const summary = `Analysis complete: ${findings.length} finding(s) — ${critical} critical, ${warning} warning.`;

  return { findings, score, summary };
}

// ── API handler ──

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Fetch all evidence for the project
    const evidenceResult = await db
      .prepare("SELECT id, extracted_text, ai_summary, title, source, doc_type FROM evidence WHERE project_id = ?")
      .bind(projectId)
      .all();

    // Fetch all timeline events
    const timelineResult = await db
      .prepare("SELECT id, event_date, event_type, description, evidence_id FROM timeline_events WHERE project_id = ? ORDER BY event_date ASC")
      .bind(projectId)
      .all();

    const evidence = evidenceResult.results ?? [];
    const timeline = timelineResult.results ?? [];

    // Run analysis
    const { findings, score, summary } = analyzeProject(evidence, timeline);

    // Clear old findings for this project
    await db.prepare("DELETE FROM due_process_findings WHERE project_id = ?").bind(projectId).run();

    // Insert new findings
    for (const finding of findings) {
      await db
        .prepare(
          `INSERT INTO due_process_findings (id, project_id, rule, severity, status, detail, evidence_id)
           VALUES (?, ?, ?, ?, 'open', ?, ?)`
        )
        .bind(uuid(), projectId, finding.rule, finding.severity, finding.detail, finding.evidence_id)
        .run();
    }

    // Update project's due_process_score
    await db
      .prepare("UPDATE projects SET due_process_score = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(score, projectId)
      .run();

    return NextResponse.json(
      {
        projectId,
        score,
        summary,
        findingsCount: findings.length,
        criticalCount: findings.filter((f) => f.severity === "critical").length,
        warningCount: findings.filter((f) => f.severity === "warning").length,
        findings: findings.map((f) => ({
          ...f,
          ruleName: RULES[f.rule]?.name ?? f.rule,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function GET(req: NextRequest) {
  // GET returns the current findings without re-running the analysis
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const findings = await db
      .prepare(
        `SELECT id, rule, severity, status, detail, evidence_id, created_at
         FROM due_process_findings WHERE project_id = ?
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`
      )
      .bind(projectId)
      .all();

    const project = await db
      .prepare("SELECT due_process_score FROM projects WHERE id = ?")
      .bind(projectId)
      .first();

    return NextResponse.json(
      {
        score: project?.due_process_score ?? null,
        items: findings.results ?? [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
