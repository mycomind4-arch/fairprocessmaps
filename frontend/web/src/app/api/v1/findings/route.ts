import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysisAgents } from "@/lib/analysis-agents";
import { runAnalysis, RULES } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await db
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
      { items: result.results ?? [], score: project?.due_process_score ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// POST — run full analysis agents (statute matching + discrepancy detection + timeline + facts)
export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Get property ID for the project
    const project = await db
      .prepare("SELECT property_id FROM projects WHERE id = ?")
      .bind(projectId)
      .first();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Run the new multi-agent analysis system
    const analysisResult = await runAnalysisAgents({
      projectId,
      propertyId: project.property_id as string,
      db,
    });

    // Also run the legacy rule-based analysis (for backward compatibility)
    // This catches timeline-based rules that the agents don't cover
    const legacyResult = await runAnalysis(projectId);

    return NextResponse.json({
      score: legacyResult.score,
      summary: analysisResult.summary,
      agentCount: analysisResult.results.length,
      results: analysisResult.results.map(r => ({
        agent: r.agent,
        status: r.status,
        message: r.message,
      })),
      totalFindings: analysisResult.totalFindings,
      criticalFindings: analysisResult.criticalFindings,
      warningFindings: analysisResult.warningFindings,
      guardrail: "You identify evidentiary status. You do not render legal conclusions.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// PATCH — update finding status (resolve/unresolve)
export async function PATCH(req: NextRequest) {
  try {
    const findingId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!findingId || !projectId) {
      return NextResponse.json({ error: "id and projectId are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = (await req.json()) as { status?: string };
    if (!body.status || !["open", "resolved", "dismissed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    await db
      .prepare("UPDATE due_process_findings SET status = ? WHERE id = ? AND project_id = ?")
      .bind(body.status, findingId, projectId)
      .run();

    return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
