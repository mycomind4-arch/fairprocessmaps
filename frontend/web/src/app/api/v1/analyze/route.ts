import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysis, RULES } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await runAnalysis(projectId);

    return NextResponse.json(
      {
        projectId,
        score: result.score,
        summary: result.summary,
        findingsCount: result.findingsCount,
        criticalCount: result.criticalCount,
        warningCount: result.warningCount,
        findings: result.findings.map((f) => ({
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
        `SELECT id, rule, rule_name, severity, status, detail, evidence_id, created_at
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
