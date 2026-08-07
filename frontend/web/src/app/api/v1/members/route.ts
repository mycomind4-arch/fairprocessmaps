import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

// GET — list members for a project (org-scoped)
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
        `SELECT id, name, email, role, added_at, updated_at
         FROM project_members
         WHERE project_id = ? AND organization_id = ?
         ORDER BY added_at ASC`,
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

// POST — invite a member
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = await req.json() as Record<string, unknown>;
    const projectId = body.project_id as string;
    const email = body.email as string;
    const role = (body.role as string) ?? "viewer";
    const name = (body.name as string) ?? email?.split("@")[0];

    if (!projectId || !email) {
      return NextResponse.json(
        { error: "project_id and email are required" },
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

    // Check for existing member with same email
    const existing = await db
      .prepare(
        "SELECT id FROM project_members WHERE project_id = ? AND email = ? AND organization_id = ?",
      )
      .bind(projectId, email, user.organization_id)
      .first<any>();

    if (existing) {
      return NextResponse.json(
        { error: "Member with this email already exists" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO project_members (id, project_id, organization_id, name, email, role)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, projectId, user.organization_id, name, email, role)
      .run();

    await emitAuditEvent({ db,
      actor: humanActor(user),
      action: "member.invite",
      resourceType: "project",
      resourceId: projectId,
      detail: JSON.stringify({ member_id: id, email, role }),
    });

    return NextResponse.json(
      { id, status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// DELETE — remove a member
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const memberId = req.nextUrl.searchParams.get("id");
    if (!memberId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const existing = await db
      .prepare("SELECT project_id, organization_id FROM project_members WHERE id = ?")
      .bind(memberId)
      .first<any>();

    if (!existing) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (existing.organization_id !== user.organization_id) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    await db
      .prepare("DELETE FROM project_members WHERE id = ?")
      .bind(memberId)
      .run();

    await emitAuditEvent({ db,
      actor: humanActor(user),
      action: "member.remove",
      resourceType: "project",
      resourceId: existing.project_id,
      detail: JSON.stringify({ member_id: memberId }),
    });

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
