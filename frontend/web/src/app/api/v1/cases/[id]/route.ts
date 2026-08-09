import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

/**
 * Canonical case detail endpoint.
 * During migration it accepts either a Case ID or a legacy Project ID,
 * resolving the latter through case_projects without exposing cross-org data.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;
    const { id } = await params;
    const { env } = getCloudflareContext();
    const db = env.DB;

    const row = await db.prepare(`
      SELECT
        c.id, c.name, c.case_number, c.case_type, c.status, c.priority,
        c.description, c.assigned_to, c.due_date, c.opened_at, c.closed_at,
        c.updated_at,
        p.id AS legacy_project_id, p.property_id, p.due_process_score,
        pr.apn, pr.address, pr.city, pr.zoning, pr.acres,
        pr.centroid_lng, pr.centroid_lat, pr.geom_geojson,
        (SELECT COUNT(*) FROM due_process_findings f JOIN case_projects x ON x.project_id = f.project_id
          WHERE x.case_id = c.id AND f.status = 'open') AS open_findings_count,
        (SELECT COUNT(*) FROM due_process_findings f JOIN case_projects x ON x.project_id = f.project_id
          WHERE x.case_id = c.id AND f.status = 'open' AND f.severity = 'critical') AS critical_findings_count,
        (SELECT COUNT(*) FROM evidence e JOIN case_projects x ON x.project_id = e.project_id
          WHERE x.case_id = c.id) AS evidence_count,
        (SELECT COUNT(*) FROM timeline_events t JOIN case_projects x ON x.project_id = t.project_id
          WHERE x.case_id = c.id) AS timeline_count,
        (SELECT MAX(e.created_at) FROM evidence e JOIN case_projects x ON x.project_id = e.project_id
          WHERE x.case_id = c.id AND e.source = 'ai_research' AND e.doc_type = 'recon_report') AS last_recon_at
      FROM cases c
      LEFT JOIN case_projects cp ON cp.case_id = c.id AND cp.role = 'primary'
      LEFT JOIN projects p ON p.id = cp.project_id
      LEFT JOIN properties pr ON pr.id = p.property_id
      WHERE c.organization_id = ?
        AND (c.id = ? OR EXISTS (
          SELECT 1 FROM case_projects lookup_cp
           WHERE lookup_cp.case_id = c.id AND lookup_cp.project_id = ?
        ))
      LIMIT 1
    `).bind(user.organization_id, id, id).first();

    if (!row) return NextResponse.json({ error: "Case not found" }, { status: 404 });

    const r: any = row;
    const centroid = r.centroid_lng != null && r.centroid_lat != null
      ? { type: "Point", coordinates: [Number(r.centroid_lng), Number(r.centroid_lat)] }
      : null;

    return NextResponse.json({
      id: r.id,
      name: r.name,
      case_number: r.case_number ?? null,
      case_type: r.case_type,
      status: r.status,
      priority: r.priority ?? "normal",
      description: r.description ?? null,
      assigned_to: r.assigned_to ?? null,
      due_date: r.due_date ?? null,
      opened_at: r.opened_at,
      closed_at: r.closed_at ?? null,
      updated_at: r.updated_at,
      legacyProjectId: r.legacy_project_id ?? null,
      property_id: r.property_id ?? null,
      due_process_score: r.due_process_score ?? null,
      reconCompleted: !!r.last_recon_at,
      lastReconAt: r.last_recon_at ?? null,
      evidenceCount: Number(r.evidence_count ?? 0),
      timelineCount: Number(r.timeline_count ?? 0),
      openFindingsCount: Number(r.open_findings_count ?? 0),
      criticalFindingsCount: Number(r.critical_findings_count ?? 0),
      property: {
        id: r.property_id ?? null,
        apn: r.apn ?? null,
        address: r.address ?? null,
        city: r.city ?? null,
        zoning: r.zoning ?? null,
        acres: r.acres ?? null,
        centroid,
        geom: r.geom_geojson ? JSON.parse(r.geom_geojson) : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
