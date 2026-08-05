import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

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

    // Properties are shared — no org filter
    const property = await db.prepare("SELECT * FROM properties WHERE id = ?").bind(id).first();

    if (!property) {
      return NextResponse.json(
        { error: "property not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // But child counts are org-scoped
    const projectCount = await db
      .prepare("SELECT COUNT(*) AS n FROM projects WHERE property_id = ? AND organization_id = ?")
      .bind(id, user.organization_id)
      .first();

    const evidenceCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM evidence e
         JOIN projects p ON e.project_id = p.id
         WHERE p.property_id = ? AND e.organization_id = ?`,
      )
      .bind(id, user.organization_id)
      .first();

    const timelineCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM timeline_events t
         JOIN projects p ON t.project_id = p.id
         WHERE p.property_id = ? AND t.organization_id = ?`,
      )
      .bind(id, user.organization_id)
      .first();

    return NextResponse.json({
      ...property,
      projectCount: projectCount?.n ?? 0,
      evidenceCount: evidenceCount?.n ?? 0,
      timelineCount: timelineCount?.n ?? 0,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
