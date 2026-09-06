/**
 * POST /api/v1/cases/[id]/assistant/message — send a message to the case
 * assistant.
 *
 * Runs the tool-use loop (src/lib/case-assistant.ts) and returns Claude's
 * reply plus any write actions it proposed. Nothing it proposes is applied
 * here — see POST .../assistant/confirm.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAssistantMessage } from "@/lib/case-assistant";

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

    const authz = authorize(user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Every message can trigger several model calls (the tool loop); keep it
    // tightly limited, same order as case intake.
    const limit = await checkRateLimit(req, "case_assistant_message", 10, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json().catch(() => ({}))) as { message?: string };
    if (!body.message?.trim()) {
      return NextResponse.json(
        { error: "message is required" },
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

    const result = await sendAssistantMessage(env as never, db, projectId, orgId, body.message.trim());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
