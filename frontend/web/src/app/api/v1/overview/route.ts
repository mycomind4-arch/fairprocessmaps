import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

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

    // Org-scoped project + shared property
    const project = await db
      .prepare(
        `SELECT p.*, pr.apn, pr.address
         FROM projects p
         JOIN properties pr ON p.property_id = pr.id
         WHERE p.id = ? AND p.organization_id = ?`,
      )
      .bind(projectId, user.organization_id)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "project not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const evidenceCount = await db
      .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND organization_id = ?")
      .bind(projectId, user.organization_id)
      .first();

    const findings = await db
      .prepare(
        `SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_count,
           SUM(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical
         FROM due_process_findings WHERE project_id = ? AND organization_id = ?`,
      )
      .bind(projectId, user.organization_id)
      .first();

    const timelineCount = await db
      .prepare("SELECT COUNT(*) AS n FROM timeline_events WHERE project_id = ? AND organization_id = ?")
      .bind(projectId, user.organization_id)
      .first();

    const recentEvidence = await db
      .prepare(
        `SELECT id, title, source, status, created_at
         FROM evidence WHERE project_id = ? AND organization_id = ?
         ORDER BY created_at DESC LIMIT 5`,
      )
      .bind(projectId, user.organization_id)
      .all();

    const recentTimeline = await db
      .prepare(
        `SELECT id, event_date, event_type, description
         FROM timeline_events WHERE project_id = ? AND organization_id = ?
         ORDER BY event_date DESC LIMIT 5`,
      )
      .bind(projectId, user.organization_id)
      .all();

    return NextResponse.json({
      projectName: project.name,
      caseType: project.case_type,
      status: project.status,
      openedAt: project.opened_at,
      apn: project.apn,
      address: project.address,
      evidenceCount: evidenceCount?.n ?? 0,
      findingsCount: findings?.open_count ?? 0,
      criticalCount: findings?.critical ?? 0,
      timelineCount: timelineCount?.n ?? 0,
      dueProcessScore: project.due_process_score,
      recentEvidence: recentEvidence.results ?? [],
      recentTimeline: recentTimeline.results ?? [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
