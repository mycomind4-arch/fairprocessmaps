import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

/**
 * GET /api/v1/cases
 * Canonical case listing. Legacy projects are joined only as compatibility
 * data; new application code should treat the returned `id` as the case ID.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const { env } = getCloudflareContext();
    const db = env.DB;
    const status = req.nextUrl.searchParams.get("status");
    const caseType = req.nextUrl.searchParams.get("case_type");

    const conditions: string[] = ["c.organization_id = ?"];
    const binds: (string | number)[] = [user.organization_id];
    if (status) { conditions.push("c.status = ?"); binds.push(status); }
    if (caseType) { conditions.push("c.case_type = ?"); binds.push(caseType); }

    const result = await db.prepare(`
      SELECT
        c.id, c.name, c.case_number, c.case_type, c.status, c.priority,
        c.description, c.assigned_to, c.due_date, c.opened_at, c.closed_at,
        c.updated_at,
        p.id AS legacy_project_id,
        p.due_process_score,
        pr.id AS property_id, pr.apn, pr.address, pr.city,
        (SELECT COUNT(*) FROM due_process_findings f
          JOIN case_projects cp2 ON cp2.project_id = f.project_id
         WHERE cp2.case_id = c.id AND f.status = 'open') AS open_findings_count,
        (SELECT COUNT(*) FROM due_process_findings f
          JOIN case_projects cp2 ON cp2.project_id = f.project_id
         WHERE cp2.case_id = c.id AND f.status = 'open' AND f.severity = 'critical') AS critical_findings_count,
        (SELECT COUNT(*) FROM evidence e
          JOIN case_projects cp3 ON cp3.project_id = e.project_id
         WHERE cp3.case_id = c.id) AS evidence_count,
        (SELECT COUNT(*) FROM timeline_events te
          JOIN case_projects cp4 ON cp4.project_id = te.project_id
         WHERE cp4.case_id = c.id) AS timeline_count
      FROM cases c
      LEFT JOIN case_projects cp ON cp.case_id = c.id AND cp.role = 'primary'
      LEFT JOIN projects p ON p.id = cp.project_id
      LEFT JOIN properties pr ON pr.id = p.property_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY c.updated_at DESC
    `).bind(...binds).all();

    const items = (result.results ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      case_number: row.case_number ?? null,
      case_type: row.case_type,
      status: row.status,
      priority: row.priority ?? "normal",
      description: row.description ?? null,
      assigned_to: row.assigned_to ?? null,
      due_date: row.due_date ?? null,
      opened_at: row.opened_at,
      closed_at: row.closed_at ?? null,
      updated_at: row.updated_at,
      legacyProjectId: row.legacy_project_id ?? null,
      due_process_score: row.due_process_score ?? null,
      property_id: row.property_id ?? null,
      property: { apn: row.apn ?? null, address: row.address ?? null, city: row.city ?? null },
      openFindingsCount: Number(row.open_findings_count ?? 0),
      criticalFindingsCount: Number(row.critical_findings_count ?? 0),
      evidenceCount: Number(row.evidence_count ?? 0),
      timelineCount: Number(row.timeline_count ?? 0),
    }));

    return NextResponse.json({ items, total: items.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
