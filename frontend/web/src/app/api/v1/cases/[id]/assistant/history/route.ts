/**
 * GET /api/v1/cases/[id]/assistant/history — load the case assistant
 * conversation and any actions still awaiting approval.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { getAssistantHistory } from "@/lib/case-assistant";

export const runtime = "nodejs";

export async function GET(
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

    const result = await getAssistantHistory(db, projectId, orgId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
