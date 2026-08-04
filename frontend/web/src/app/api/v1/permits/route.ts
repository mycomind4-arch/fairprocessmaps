import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

// GET /api/v1/permits?projectId=xxx
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
        `SELECT * FROM building_permits WHERE project_id = ? ORDER BY 
         CASE permit_status
           WHEN 'pending' THEN 0
           WHEN 'under_review' THEN 1
           WHEN 'issued' THEN 2
           WHEN 'inspections' THEN 3
           WHEN 'finalized' THEN 4
           WHEN 'expired' THEN 5
           WHEN 'denied' THEN 6
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

// POST
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { env } = getCloudflareContext();
    const db = env.DB;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Auto-compute expiry (180 days from issue for most permits)
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
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        (body.project_id as string),
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
        now,
        now
      )
      .run();

    const created = await db
      .prepare("SELECT * FROM building_permits WHERE id = ?")
      .bind(id)
      .first();

    return NextResponse.json(created, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// PATCH /api/v1/permits?id=xxx
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
      "permit_number", "permit_type", "permit_status", "description",
      "valuation", "sqft", "issued_date", "expired_date", "finalized_date",
      "assigned_inspector", "inspections_count", "last_inspection_date",
      "last_inspection_result", "notes",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    fields.push(`updated_at = ?`);
    values.push(new Date().toISOString());
    values.push(id);

    await db.prepare(`UPDATE building_permits SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

    const updated = await db
      .prepare("SELECT * FROM building_permits WHERE id = ?")
      .bind(id)
      .first();

    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
