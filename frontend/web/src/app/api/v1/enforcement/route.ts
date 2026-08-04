import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

// GET /api/v1/enforcement?projectId=xxx
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await db
      .prepare(
        `SELECT * FROM code_enforcement_cases WHERE project_id = ? ORDER BY 
         CASE status 
           WHEN 'open' THEN 0 
           WHEN 'notice_served' THEN 1 
           WHEN 'compliance_period' THEN 2 
           WHEN 'hearing_scheduled' THEN 3 
           WHEN 'abatement_pending' THEN 4 
           WHEN 'appealed' THEN 5 
           WHEN 'abated' THEN 6 
           WHEN 'closed' THEN 7 
         END,
         created_at DESC`
      )
      .bind(projectId)
      .all();

    return NextResponse.json({ items: result.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// POST /api/v1/enforcement
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { env } = getCloudflareContext();
    const db = env.DB;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Auto-compute compliance deadline from notice date + notice period
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
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        (body.project_id as string),
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
        (body.lien_filed as boolean) ? 1 : 0,
        (body.hearing_date as string) || null,
        (body.hearing_type as string) || null,
        (body.appeal_filed as boolean) ? 1 : 0,
        (body.appeal_date as string) || null,
        (body.outcome as string) || null,
        (body.notes as string) || null,
        now,
        now
      )
      .run();

    const created = await db
      .prepare("SELECT * FROM code_enforcement_cases WHERE id = ?")
      .bind(id)
      .first();

    return NextResponse.json(created, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// PATCH /api/v1/enforcement?id=xxx
export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = await req.json() as Record<string, unknown>;
    const { env } = getCloudflareContext();
    const db = env.DB;

    const fields: string[] = [];
    const values: unknown[] = [];

    const allowed = [
      "case_number", "violation_type", "violation_description", "severity", "status",
      "notice_served_date", "notice_method", "notice_period_days", "compliance_deadline",
      "abatement_date", "abatement_cost", "hearing_date", "hearing_type",
      "appeal_filed", "appeal_date", "outcome", "notes",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (body.lien_filed !== undefined) {
      fields.push("lien_filed = ?");
      values.push((body.lien_filed as boolean) ? 1 : 0);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    fields.push(`updated_at = ?`);
    values.push(new Date().toISOString());
    values.push(id);

    await db.prepare(`UPDATE code_enforcement_cases SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

    const updated = await db
      .prepare("SELECT * FROM code_enforcement_cases WHERE id = ?")
      .bind(id)
      .first();

    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
