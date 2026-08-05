import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { getRelationshipLineage } from "@/lib/agents/proposals";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "relationship.read");
    if (!authz.ok) return authz.response;

    const { env } = getCloudflareContext();
    const db = env.DB;

    const lineage = await getRelationshipLineage(db, id, auth.user.organization_id);

    if (!lineage) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Relationship not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: lineage, error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Failed to fetch lineage" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
