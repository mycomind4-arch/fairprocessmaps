/**
 * POST /api/v1/permits/sync
 *
 * Syncs building permits from Humboldt County's Accela portal to D1.
 * Mirrors /api/v1/enforcement/sync's shape and behavior.
 *
 * IMPORTANT: unlike the enforcement/sync endpoint (backed by a verified,
 * stable ArcGIS REST layer), this delegates to permit-pipeline.ts, whose
 * live search has NOT been verified to reach a real results page — see
 * that module's doc. The response includes `scrape_status` so the client
 * can tell "county confirms zero permits" apart from "the search could not
 * be completed" and must not collapse the two.
 *
 * Auth: requires case.update permission.
 * Body: { project_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { syncPermits } from "@/lib/permit-pipeline";
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

    const project = await db
      .prepare(
        `SELECT p.property_id, prop.apn, prop.address
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

    const apn = (project.apn as string) || "";
    const address = (project.address as string) || "";
    if (!apn && !address) {
      return NextResponse.json(
        { error: "Property has no APN or address — cannot search the county permit portal" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await syncPermits(projectId, apn, address, user.organization_id, db);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Permit sync failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.update",
      resourceType: "building_permit",
      resourceId: projectId,
      detail: `Permit sync: ${result.scrapeStatus} — ${result.permitsCreated} new from county Accela portal (APN ${apn || "n/a"})`,
    });

    let analysisResult = null;
    if (result.permitsCreated > 0) {
      analysisResult = await runAnalysis(projectId);
    }

    return NextResponse.json(
      {
        ok: true,
        scrape_status: result.scrapeStatus,
        scrape_detail: result.detail,
        permits_found: result.permitsFound,
        permits_created: result.permitsCreated,
        timeline_events_created: result.timelineEventsCreated,
        permits: result.permits,
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
