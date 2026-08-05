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
        `SELECT * FROM code_enforcement_cases
         WHERE project_id = ? AND organization_id = ?
         ORDER BY CASE status
           WHEN 'open' THEN 0 WHEN 'notice_served' THEN 1 WHEN 'compliance_period' THEN 2
           WHEN 'hearing_scheduled' THEN 3 WHEN 'abatement_pending' THEN 4 WHEN 'appealed' THEN 5
           WHEN 'abated' THEN 6 WHEN 'closed' THEN 7
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

    let complianceDeadline = (body.compliance_deadline as string) || null;
    if (!complianceDeadline && body.notice_served_date && body.notice_period_days) {
      const d = new Date(body.notice_served_date as string);
      d.setDate(d.getDate() + (body.notice_period_days as number));
      complianceDeadline = d.toISOString().split("T")[0];
    }

    await db
      .prepare(
        `INSERT INTO code_enforcement_cases (
          id, project_id, case_number, violation_type, violation_description,
          severity, status, notice_served_date, notice_method, notice_period_days,
          compliance_deadline, abatement_date, abatement_cost, lien_filed,
          hearing_date, hearing_type, appeal_filed, appeal_date, outcome, notes,
          created_at, updated_at, organization_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, projectId,
        (body.case_number as string) || null,
        (body.violation_type as string),
        (body.violation_description as string) || null,
        (body.severity as string) || "moderate",
        (body.status as string) || "open",
        (body.notice_served_date as string) || null,
        (body.notice_method as string) || null,
        (body.notice_period_days as number) ?? null,
        complianceDeadline,
        (body.abatement_date as string) || null,
        (body.abatement_cost as number) ?? null,
        (body.lien_filed as number) ?? 0,
        (body.hearing_date as string) || null,
        (body.hearing_type as string) || null,
        (body.appeal_filed as number) ?? 0,
        (body.appeal_date as string) || null,
        (body.outcome as string) || null,
        (body.notes as string) || null,
        new Date().toISOString(), new Date().toISOString(),
        user.organization_id,
      )
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "case.update",
      resourceType: "code_enforcement_case",
      resourceId: id,
      detail: `CE case '${body.case_number || "unnamed"}' added by ${user.name}`,
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
