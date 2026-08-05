import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { buildCaseSummary } from "@/lib/graph/builder";
import type { ApiResponse, CaseSummary } from "@/lib/graph/types";

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

    const summary = await buildCaseSummary(db, id, auth.user.organization_id);

    if (!summary) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: summary, error: null } satisfies ApiResponse<CaseSummary>,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Summary build failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
