/**
 * POST /api/v1/enforcement/sync
 *
 * Syncs code enforcement cases from Humboldt County ArcGIS to D1.
 * Queries the county CE layer by the project's property APN and creates
 * code_enforcement_cases records + timeline events for any new cases found.
 *
 * Auth: requires case.update permission.
 * Body: { project_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { syncCECases } from "@/lib/ce-pipeline";
import { runAnalysis } from "@/lib/auto-triggers";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json() as { project_id?: string };
    const projectId = body.project_id;

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Resolve project + verify org access
    const projectOrg = await resolveProjectOrg(db, projectId);
    if (!projectOrg || projectOrg !== user.organization_id) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const authz = requireAuthz(user, "case.update", {
      organization_id: projectOrg,
    });
    if (!authz.ok) return authz.response;

    // Get the project's APN
    const project = await db
      .prepare(
        `SELECT p.property_id, prop.apn
         FROM projects p
         JOIN properties prop ON prop.id = p.property_id
         WHERE p.id = ?`
      )
      .bind(projectId)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "Project or property not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const apn = project.apn as string;
    if (!apn) {
      return NextResponse.json(
        { error: "Property has no APN — cannot query county CE layer" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Sync CE cases from ArcGIS
    const result = await syncCECases(projectId, apn, user.organization_id, db);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "CE sync failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Emit audit event
    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.update",
      resourceType: "code_enforcement_case",
      resourceId: projectId,
      detail: `CE sync: ${result.casesCreated} new, ${result.casesUpdated} updated from county GIS (APN ${apn})`,
    });

    // Re-run analysis if new cases were created
    let analysisResult = null;
    if (result.casesCreated > 0) {
      analysisResult = await runAnalysis(projectId);
    }

    return NextResponse.json(
      {
        ok: true,
        cases_found: result.casesFound,
        cases_created: result.casesCreated,
        cases_updated: result.casesUpdated,
        timeline_events_created: result.timelineEventsCreated,
        cases: result.cases.map(c => ({
          case_number: c.case_number,
          violation_type: c.violation_type,
          date_opened: c.date_opened,
        })),
        analysis: analysisResult
          ? {
              score: analysisResult.score,
              findings: analysisResult.findingsCount,
              critical: analysisResult.criticalCount,
              warning: analysisResult.warningCount,
            }
          : null,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
