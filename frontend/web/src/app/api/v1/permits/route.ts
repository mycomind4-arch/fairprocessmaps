import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

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

    const result = await db
      .prepare(
        `SELECT * FROM building_permits
         WHERE project_id = ? AND organization_id = ?
         ORDER BY CASE permit_status
           WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'issued' THEN 2
           WHEN 'inspections' THEN 3 WHEN 'finalized' THEN 4 WHEN 'expired' THEN 5 WHEN 'denied' THEN 6
         END, created_at DESC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    return NextResponse.json(
      { items: result.results ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json() as Record<string, unknown>;
    const projectId = body.project_id as string;

    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const projectOrg = await resolveProjectOrg(db, projectId);
    const authz = requireAuthz(user, "case.update", {
      organization_id: projectOrg ?? undefined,
    });
    if (!authz.ok) return authz.response;

    const id = crypto.randomUUID();

    let expiredDate = (body.expired_date as string) || null;
    if (!expiredDate && (body.issued_date as string)) {
      const d = new Date(body.issued_date as string);
      d.setDate(d.getDate() + 180);
      expiredDate = d.toISOString().split("T")[0];
    }

    await db
      .prepare(
        `INSERT INTO building_permits (
          id, project_id, permit_number, permit_type, permit_status,
          description, valuation, sqft, issued_date, expired_date,
          finalized_date, assigned_inspector, inspections_count,
          last_inspection_date, last_inspection_result, notes,
          created_at, updated_at, organization_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, projectId,
        (body.permit_number as string) || null,
        (body.permit_type as string),
        (body.permit_status as string) || "pending",
        (body.description as string) || null,
        (body.valuation as number) ?? null,
        (body.sqft as number) ?? null,
        (body.issued_date as string) || null,
        expiredDate,
        (body.finalized_date as string) || null,
        (body.assigned_inspector as string) || null,
        (body.inspections_count as number) ?? 0,
        (body.last_inspection_date as string) || null,
        (body.last_inspection_result as string) || null,
        (body.notes as string) || null,
        new Date().toISOString(), new Date().toISOString(),
        user.organization_id,
      )
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.update",
      resourceType: "building_permit",
      resourceId: id,
      detail: `Permit '${body.permit_number || "unnamed"}' added by ${user.name}`,
    });

    return NextResponse.json(
      { id, created: true },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
