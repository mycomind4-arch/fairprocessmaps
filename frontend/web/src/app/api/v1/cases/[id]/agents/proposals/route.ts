import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg, verifyOrgAccess } from "@/lib/security/middleware";
import { listProposals } from "@/lib/agents/proposals";
import type { ProposalStatus } from "@/lib/agents/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "agent.read");
    if (!authz.ok) return authz.response;

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Verify case belongs to user's org
    const caseOrgId = await resolveProjectOrg(db, id);
    if (!verifyOrgAccess(auth.user, caseOrgId)) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Case not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const statusParam = req.nextUrl.searchParams.get("status") as ProposalStatus | null;
    const proposals = await listProposals(db, id, auth.user.organization_id, statusParam ?? undefined);

    return NextResponse.json(
      { ok: true, data: { proposals }, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Failed to list proposals" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
