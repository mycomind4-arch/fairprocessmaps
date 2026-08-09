import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped query
    const project = await db
      .prepare("SELECT * FROM projects WHERE id = ? AND organization_id = ?")
      .bind(id, user.organization_id)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Properties are shared — no org filter needed
    const property = await db
      .prepare("SELECT apn, address, city, centroid_lng, centroid_lat, geom_geojson FROM properties WHERE id = ?")
      .bind(project.property_id)
      .first();

    const counts = await db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_findings,
           SUM(CASE WHEN status = 'open' AND severity = 'critical' THEN 1 ELSE 0 END) AS critical_findings
         FROM due_process_findings
         WHERE project_id = ? AND organization_id = ?`,
      )
      .bind(id, user.organization_id)
      .first();

    const evidenceCount = await db
      .prepare("SELECT COUNT(*) AS n FROM evidence WHERE project_id = ? AND organization_id = ?")
      .bind(id, user.organization_id)
      .first();

    const timelineCount = await db
      .prepare("SELECT COUNT(*) AS n FROM timeline_events WHERE project_id = ? AND organization_id = ?")
      .bind(id, user.organization_id)
      .first();

    // Check whether recon has already been run for this project
    const reconCheck = await db
      .prepare(
        `SELECT MAX(created_at) AS last_recon_at
         FROM evidence
         WHERE project_id = ? AND source = 'ai_research' AND doc_type = 'recon_report' AND organization_id = ?`,
      )
      .bind(id, user.organization_id)
      .first();

    const shapedProperty = property && {
      apn: property.apn,
      address: property.address,
      city: property.city,
      centroid:
        property.centroid_lng != null && property.centroid_lat != null
          ? { type: "Point" as const, coordinates: [property.centroid_lng, property.centroid_lat] as [number, number] }
          : null,
      geom: property.geom_geojson ? JSON.parse(property.geom_geojson as string) : null,
    };

    return NextResponse.json({
      ...project,
      property: shapedProperty,
      openFindingsCount: counts?.open_findings ?? 0,
      criticalFindingsCount: counts?.critical_findings ?? 0,
      evidenceCount: evidenceCount?.n ?? 0,
      timelineCount: timelineCount?.n ?? 0,
      reconCompleted: !!reconCheck?.last_recon_at,
      lastReconAt: reconCheck?.last_recon_at ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
