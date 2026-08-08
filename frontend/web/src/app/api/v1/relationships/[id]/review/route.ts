import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "relationship.review");
    if (!authz.allowed) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: authz.reason ?? "Insufficient permissions" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await req.json() as { status: string; review_reason?: string };
    const { status, review_reason } = body;

    if (!["accepted", "rejected", "superseded"].includes(status)) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "status must be accepted, rejected, or superseded" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Validate review_reason length to prevent storage abuse
    const reason = review_reason ?? null;
    if (reason !== null && reason.length > 2000) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "review_reason must be 2000 characters or fewer" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Update the edge lifecycle — scoped to organization_id to prevent cross-tenant modification (C1)
    const result = await db.prepare(
      `UPDATE relationships
       SET status = ?, reviewed_by = ?, reviewed_by_type = ?, reviewed_at = datetime('now'), review_reason = ?
       WHERE id = ? AND status = 'pending_review' AND organization_id = ?`,
    ).bind(status, auth.user.id, auth.user.actor_type || "human", reason, id, auth.user.organization_id).run();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Relationship not found or not pending review" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: { id: id, status }, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Review failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
