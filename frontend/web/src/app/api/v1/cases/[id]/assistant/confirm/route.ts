/**
 * POST /api/v1/cases/[id]/assistant/confirm — approve or reject a change
 * the case assistant proposed.
 *
 * This is the only place a case_assistant write tool call actually takes
 * effect. Approving re-enters the tool loop (Claude sees the result and can
 * continue); rejecting tells Claude the person declined so it doesn't
 * silently retry the same change.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor } from "@/lib/security/events";
import { resolveAssistantAction } from "@/lib/case-assistant";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    // Applying a proposed change is a real edit to the case record —
    // same permission as editing the timeline directly.
    const authz = authorize(user, "case.update");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const limit = await checkRateLimit(req, "case_assistant_confirm", 20, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as { actionId?: string; approve?: boolean };
    if (!body.actionId || typeof body.approve !== "boolean") {
      return NextResponse.json(
        { error: "actionId and approve are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const project = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND organization_id = ?`)
      .bind(projectId, orgId)
      .first();
    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = await resolveAssistantAction(
      env as never, db, projectId, orgId, body.actionId, body.approve, humanActor(user),
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
