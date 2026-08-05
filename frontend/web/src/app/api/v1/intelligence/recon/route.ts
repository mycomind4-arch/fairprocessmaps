/**
 * POST /api/v1/intelligence/recon
 *
 * Triggers full multi-agent property intelligence reconnaissance.
 * Authentication + authorization required (org-scoped project).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { runRecon } from "@/lib/recon-agents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const projectId = req.nextUrl.searchParams.get("projectId");
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing required parameter: projectId" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { env } = getCloudflareContext();
  const db = env.DB;

  const projectOrg = await resolveProjectOrg(db, projectId);
  const authz = requireAuthz(user, "case.read", {
    organization_id: projectOrg ?? undefined,
  });
  if (!authz.ok) return authz.response;

  try {
    const result = await runRecon(projectId, force);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Recon failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
