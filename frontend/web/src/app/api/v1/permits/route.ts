import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { emitEvent } from "@/lib/event-store";

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
           WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1 WHEN 'issued' THEN 2
           WHEN 'inspections' THEN 3 WHEN 'finalized' THEN 4 WHEN 'expired' THEN 5
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
    const projectId = body.project_id as string;

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
        now, now
      )
      .run();

    // ── Emit events with actual action dates ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "permit.created",
      entity_type: "permit",
      entity_id: id,
      actor_type: "user",
      title: `Permit created: ${body.permit_type || "Building"}`,
      payload: { permit_number: body.permit_number, permit_type: body.permit_type, permit_status: body.permit_status },
    });

    if (body.issued_date) {
      await emitEvent(db, {
        case_id: projectId,
        event_type: "permit.issued",
        entity_type: "permit",
        entity_id: id,
        actor_type: "user",
        event_date: body.issued_date as string,
        title: `Permit issued: ${body.permit_number || body.permit_type || "permit"}`,
        payload: { issued_date: body.issued_date, permit_number: body.permit_number },
      });
    }
    if (expiredDate) {
      await emitEvent(db, {
        case_id: projectId,
        event_type: "permit.expired",
        entity_type: "permit",
        entity_id: id,
        actor_type: "system",
        severity: "warning",
        event_date: expiredDate,
        title: `Permit expires: ${expiredDate}`,
        payload: { expired_date: expiredDate, permit_number: body.permit_number },
      });
    }

    const created = await db.prepare("SELECT * FROM building_permits WHERE id = ?").bind(id).first();
    return NextResponse.json(created, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// PATCH
export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = await req.json() as Record<string, unknown>;
    const { env } = getCloudflareContext();
    const db = env.DB;

    const existing = await db.prepare("SELECT * FROM building_permits WHERE id = ?").bind(id).first() as any;
    const projectId = existing?.project_id;

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

    // ── Emit events with actual action dates ──
    if (projectId) {
      if (body.issued_date && body.issued_date !== existing?.issued_date) {
        await emitEvent(db, {
          case_id: projectId,
          event_type: "permit.issued",
          entity_type: "permit",
          entity_id: id,
          actor_type: "user",
          event_date: body.issued_date as string,
          title: `Permit issued: ${existing?.permit_number || "permit"}`,
          payload: { issued_date: body.issued_date },
        });
      }
      if (body.finalized_date && body.finalized_date !== existing?.finalized_date) {
        await emitEvent(db, {
          case_id: projectId,
          event_type: "permit.finalized",
          entity_type: "permit",
          entity_id: id,
          actor_type: "user",
          event_date: body.finalized_date as string,
          title: `Permit finalized: ${existing?.permit_number || "permit"}`,
          payload: { finalized_date: body.finalized_date },
        });
      }
      if (body.last_inspection_date && body.last_inspection_date !== existing?.last_inspection_date) {
        await emitEvent(db, {
          case_id: projectId,
          event_type: "permit.inspection",
          entity_type: "permit",
          entity_id: id,
          actor_type: "user",
          event_date: body.last_inspection_date as string,
          title: `Inspection: ${body.last_inspection_result || "result unknown"}`,
          payload: { inspection_date: body.last_inspection_date, result: body.last_inspection_result },
        });
      }
    }

    const updated = await db.prepare("SELECT * FROM building_permits WHERE id = ?").bind(id).first();
    return NextResponse.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    await db.prepare("DELETE FROM building_permits WHERE id = ?").bind(id).run();

    return NextResponse.json({ success: true, id }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
