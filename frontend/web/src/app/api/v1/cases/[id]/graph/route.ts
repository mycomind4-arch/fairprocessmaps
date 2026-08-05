import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { buildCaseGraph } from "@/lib/graph/builder";
import type { ApiResponse, CaseGraph } from "@/lib/graph/types";

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
    const projectId = id;

    const graph = await buildCaseGraph(db, projectId, auth.user.organization_id);

    if (!graph) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: graph, error: null } satisfies ApiResponse<CaseGraph>,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Graph build failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
