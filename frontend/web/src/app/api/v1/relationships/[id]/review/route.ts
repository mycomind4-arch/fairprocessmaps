import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "relationship.review");
    if (!authz.allowed) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: authz.reason ?? "Insufficient permissions" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await req.json();
    const { status, review_reason } = body;

    if (!["accepted", "rejected", "superseded"].includes(status)) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "status must be accepted, rejected, or superseded" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Update the edge lifecycle
    const result = await db.prepare(
      `UPDATE relationships
       SET status = ?, reviewed_by = ?, reviewed_by_type = ?, reviewed_at = datetime('now'), review_reason = ?
       WHERE id = ? AND status = 'pending_review'`,
    ).bind(status, auth.user.id, auth.user.actor_type || "human", review_reason || null, params.id).run();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Relationship not found or not pending review" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: { id: params.id, status }, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Review failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
