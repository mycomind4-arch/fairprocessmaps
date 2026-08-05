import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { buildNodeExplanation } from "@/lib/graph/builder";
import type { ApiResponse, NodeExplanation } from "@/lib/graph/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: authz.reason ?? "Insufficient permissions" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const nodeId = req.nextUrl.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "nodeId is required" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const explanation = await buildNodeExplanation(db, id, nodeId, auth.user.organization_id);

    if (!explanation) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Node not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: explanation, error: null } satisfies ApiResponse<NodeExplanation>,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Explanation build failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
