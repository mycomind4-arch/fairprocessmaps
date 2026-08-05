import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped: only projects belonging to the user's organization
    const result = await db
      .prepare(
        `SELECT
           p.id, p.name, p.case_type, p.status, p.due_process_score,
           p.opened_at, p.updated_at,
           pr.apn, pr.address, pr.city,
           (SELECT COUNT(*) FROM due_process_findings f
            WHERE f.project_id = p.id AND f.status = 'open' AND f.organization_id = ?) AS open_findings_count,
           (SELECT COUNT(*) FROM due_process_findings f
            WHERE f.project_id = p.id AND f.status = 'open' AND f.severity = 'critical' AND f.organization_id = ?) AS critical_findings_count,
           (SELECT COUNT(*) FROM evidence e
            WHERE e.project_id = p.id AND e.organization_id = ?) AS evidence_count
         FROM projects p
         JOIN properties pr ON p.property_id = pr.id
         WHERE p.organization_id = ?
         ORDER BY p.updated_at DESC`,
      )
      .bind(user.organization_id, user.organization_id, user.organization_id, user.organization_id)
      .all();

    const items = (result.results ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      case_type: row.case_type,
      status: row.status,
      due_process_score: row.due_process_score,
      opened_at: row.opened_at,
      property: {
        apn: row.apn,
        address: row.address,
        city: row.city,
      },
      openFindingsCount: row.open_findings_count ?? 0,
      criticalFindingsCount: row.critical_findings_count ?? 0,
      evidenceCount: row.evidence_count ?? 0,
    }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
