import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { buildEntityRelationships } from "@/lib/graph/builder";
import type { ApiResponse, EntityRelationships } from "@/lib/graph/types";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  try {
    const { type, id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "relationship.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "FORBIDDEN", message: authz.reason ?? "Insufficient permissions" } },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // caseId is required as a query param for org-scoping
    const caseId = req.nextUrl.searchParams.get("caseId");
    if (!caseId) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "caseId is required" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const rels = await buildEntityRelationships(
      db,
      type,
      id,
      caseId,
    );

    if (!rels) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: "Entity not found" } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { ok: true, data: rels, error: null } satisfies ApiResponse<EntityRelationships>,
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Relationship build failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
