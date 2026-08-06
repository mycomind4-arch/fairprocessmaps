import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { runAnalysisAgents } from "@/lib/analysis-agents";
import { runAnalysis, RULES } from "@/lib/auto-triggers";

export const runtime = "nodejs";

// GET — list findings (org-scoped)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped query
    const result = await db
      .prepare(
        `SELECT id, rule, rule_name, severity, status, detail, evidence_id, created_at,
                reviewed_by, reviewed_at
         FROM due_process_findings
         WHERE project_id = ? AND organization_id = ?
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    const project = await db
      .prepare("SELECT due_process_score FROM projects WHERE id = ? AND organization_id = ?")
      .bind(projectId, user.organization_id)
      .first();

    return NextResponse.json(
      { items: result.results ?? [], score: project?.due_process_score ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// POST — run analysis (org-scoped)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Verify project belongs to user's org
    const projectOrg = await resolveProjectOrg(db, projectId);
    const authz = requireAuthz(user, "case.read", {
      organization_id: projectOrg ?? undefined,
    });
    if (!authz.ok) return authz.response;

    const project = await db
      .prepare("SELECT property_id FROM projects WHERE id = ? AND organization_id = ?")
      .bind(projectId, user.organization_id)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const analysisResult = await runAnalysisAgents({
      projectId,
      propertyId: project.property_id as string,
      organizationId: user.organization_id as string,
      db,
    });
    const legacyResult = await runAnalysis(projectId);

    return NextResponse.json(
      {
        score: legacyResult.score,
        summary: analysisResult.summary,
        agentCount: analysisResult.results.length,
        results: analysisResult.results.map((r) => ({
          agent: r.agent,
          status: r.status,
          message: r.message,
        })),
        totalFindings: analysisResult.totalFindings,
        criticalFindings: analysisResult.criticalFindings,
        warningFindings: analysisResult.warningFindings,
        guardrail: "You identify evidentiary status. You do not render legal conclusions.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// PATCH — update finding status (resolve/dismiss/reopen) with actor provenance
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const findingId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!findingId || !projectId) {
      return NextResponse.json(
        { error: "id and projectId are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const authz = requireAuthz(user, "finding.review");
    if (!authz.ok) return authz.response;

    const body = (await req.json()) as { status?: string };
    if (!body.status || !["open", "resolved", "dismissed"].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const now = new Date().toISOString();

    // Org-scoped update
    const result = await db
      .prepare(
        `UPDATE due_process_findings
         SET status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ? AND project_id = ? AND organization_id = ?`,
      )
      .bind(body.status, user.id, now, findingId, projectId, user.organization_id)
      .run();

    // Emit audit event
    const actor = humanActor(user);
    await emitAuditEvent({
      db,
      actor,
      action: "finding.review",
      resourceType: "finding",
      resourceId: findingId,
      detail: `Finding status changed to '${body.status}' by ${user.name}`,
    });

    return NextResponse.json(
      { updated: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
