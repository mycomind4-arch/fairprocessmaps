import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const property = await db
      .prepare("SELECT * FROM properties WHERE id = ?")
      .bind(id)
      .first();

    if (!property) {
      return NextResponse.json({ error: "property not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // Get project count for this property
    const projectCount = await db
      .prepare("SELECT COUNT(*) AS n FROM projects WHERE property_id = ?")
      .bind(id)
      .first();

    // Get evidence count across all projects for this property
    const evidenceCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM evidence e
         JOIN projects p ON e.project_id = p.id
         WHERE p.property_id = ?`
      )
      .bind(id)
      .first();

    // Get timeline event count
    const timelineCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM timeline_events t
         JOIN projects p ON t.project_id = p.id
         WHERE p.property_id = ?`
      )
      .bind(id)
      .first();

    return NextResponse.json({
      ...property,
      projectCount: projectCount?.n ?? 0,
      evidenceCount: evidenceCount?.n ?? 0,
      timelineCount: timelineCount?.n ?? 0,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
