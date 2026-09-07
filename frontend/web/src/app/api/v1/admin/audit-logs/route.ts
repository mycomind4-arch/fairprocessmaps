/**
 * GET /api/v1/admin/audit-logs
 *
 * Reads the organization's own audit trail. The data has been real and
 * accumulating all along — every emitAuditEvent() call across the app
 * (agent runs, permit/CE syncs, evidence uploads, proposal reviews, member
 * changes, this route's own writes) already inserts into audit_logs. There
 * was simply no route to read it back.
 *
 * Always scoped to the caller's own organization_id.
 *
 * Auth: requires the "audit.read" permission (admin role only).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";

export const runtime = "nodejs";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = requireAuthz(user, "audit.read");
    if (!authz.ok) return authz.response;

    const { env } = getCloudflareContext();
    const db = env.DB;

    const action = req.nextUrl.searchParams.get("action");
    const actorType = req.nextUrl.searchParams.get("actor_type");
    const search = req.nextUrl.searchParams.get("search");
    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    const conditions: string[] = ["organization_id = ?"];
    const binds: unknown[] = [user.organization_id];

    if (action) { conditions.push("action = ?"); binds.push(action); }
    if (actorType) { conditions.push("actor_type = ?"); binds.push(actorType); }
    if (search) {
      conditions.push("(action LIKE ? OR resource_type LIKE ? OR resource_id LIKE ? OR details LIKE ?)");
      const like = `%${search}%`;
      binds.push(like, like, like, like);
    }

    binds.push(limit);

    const result = await db
      .prepare(
        `SELECT id, organization_id, actor_type, actor_id, actor_name, action,
                resource_type, resource_id, details, created_at
         FROM audit_logs
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(...binds)
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
