import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { runIntelligence } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    const force = req.nextUrl.searchParams.get("force") === "true";

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
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

    if (force) {
      const { runRecon } = await import("@/lib/recon-agents");
      const result = await runRecon(projectId, true);
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    const result = await runIntelligence(projectId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { message: result.message, projectId, evidenceId: result.evidenceId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
