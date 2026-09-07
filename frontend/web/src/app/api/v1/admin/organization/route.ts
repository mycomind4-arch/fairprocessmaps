/**
 * GET/PATCH /api/v1/admin/organization
 *
 * The caller's own organization's identity (name, type, status). Always
 * scoped to the authenticated admin's own organization_id — there is no
 * "which org" parameter, deliberately: this route manages the org you
 * belong to, not an arbitrary one.
 *
 * Auth: requires the "org.manage" permission (admin role only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "org.manage");
    if (!authz.ok) return authz.response;

    const { env } = getCloudflareContext();
    const db = env.DB;

    const org = await db
      .prepare("SELECT id, name, slug, org_type, status, created_at FROM organizations WHERE id = ?")
      .bind(user.organization_id)
      .first();

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const memberCount = await db
      .prepare("SELECT COUNT(*) AS n FROM organization_members WHERE organization_id = ? AND status = 'active'")
      .bind(user.organization_id)
      .first<{ n: number }>();

    return NextResponse.json(
      { organization: org, active_member_count: memberCount?.n ?? 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "org.manage");
    if (!authz.ok) return authz.response;

    const body = await req.json() as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    await db
      .prepare("UPDATE organizations SET name = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(name, user.organization_id)
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "org.update",
      resourceType: "organization",
      resourceId: user.organization_id,
      detail: `Renamed organization to '${name}'`,
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
