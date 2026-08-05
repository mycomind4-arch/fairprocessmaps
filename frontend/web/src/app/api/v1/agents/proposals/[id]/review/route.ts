import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { reviewProposal } from "@/lib/agents/proposals";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "agent.review");
    if (!authz.ok) return authz.response;

    const body = await req.json() as { decision: string; review_reason?: string };
    const { decision, review_reason } = body;
    const typedDecision = decision as "accepted" | "rejected";

    if (!["accepted", "rejected"].includes(decision)) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "decision must be 'accepted' or 'rejected'" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await reviewProposal(db, id, auth.user, typedDecision, review_reason ?? null);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: result.reason ?? "Review failed" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: { id: id, decision }, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Review failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
