import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, resolveProjectOrg } from "@/lib/security/middleware";

export const runtime = "nodejs";

// GET — load project settings (org-scoped)
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

    const row = await db
      .prepare(
        "SELECT settings_json FROM project_settings WHERE project_id = ? AND organization_id = ?",
      )
      .bind(projectId, user.organization_id)
      .first<any>();

    const settings = row?.settings_json ? JSON.parse(row.settings_json) : null;

    return NextResponse.json(
      { settings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// PUT — save project settings (upsert, org-scoped)
export async function PUT(req: NextRequest) {
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
    if (projectOrg !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const settingsJson = JSON.stringify(body.settings ?? {});

    await db
      .prepare(
        `INSERT INTO project_settings (project_id, organization_id, settings_json, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(project_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = datetime('now')`,
      )
      .bind(projectId, user.organization_id, settingsJson)
      .run();

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// DELETE — remove project settings (org-scoped)
export async function DELETE(req: NextRequest) {
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

    await db
      .prepare("DELETE FROM project_settings WHERE project_id = ? AND organization_id = ?")
      .bind(projectId, user.organization_id)
      .run();

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
