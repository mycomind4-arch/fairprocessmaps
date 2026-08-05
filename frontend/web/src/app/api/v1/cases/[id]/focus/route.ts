import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { buildInvestigationFocus } from "@/lib/graph/builder";
import type { ApiResponse, InvestigationFocus } from "@/lib/graph/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: authz.reason ?? "Insufficient permissions" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const focus = await buildInvestigationFocus(db, params.id, auth.user.organization_id);

    if (!focus) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: focus, error: null } satisfies ApiResponse<InvestigationFocus>,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Investigation focus build failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
