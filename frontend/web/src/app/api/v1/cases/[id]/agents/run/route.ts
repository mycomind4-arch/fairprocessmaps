import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg, verifyOrgAccess } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = requireAuthz(auth.user, "agent.run");
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

    const body = await req.json() as { agent_type: string };
    const { agent_type } = body;

    if (!agent_type) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "BAD_REQUEST", message: "agent_type is required" } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Look up the agent definition
    const agentDef = await db.prepare(
      `SELECT * FROM agent_definitions WHERE agent_type = ? ORDER BY version DESC LIMIT 1`,
    ).bind(agent_type).first();

    if (!agentDef) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_FOUND", message: `No registered agent of type '${agent_type}'` } },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const def = agentDef as Record<string, unknown>;

    // Dynamic import of the agent module
    // Agents are registered in the agent registry (see lib/agents/registry.ts)
    const { getAgent } = await import("@/lib/agents/registry");
    const agent = getAgent(agent_type);

    if (!agent) {
      return NextResponse.json(
        { ok: false, data: null, error: { code: "NOT_IMPLEMENTED", message: `Agent '${agent_type}' is not yet implemented` } },
        { status: 501, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Run the agent in sandbox mode
    const { runAgent } = await import("@/lib/agents/runner");
    const result = await runAgent(
      db,
      id,
      auth.user.organization_id,
      agent.execute,
      {
        agent_id: def.id as string,
        agent_version: def.version as string,
        model_version: (def.model_version as string) || null,
        agent_type: def.agent_type as string,
      },
    );

    return NextResponse.json(
      { ok: true, data: result, error: null },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: err instanceof Error ? err.message : "Agent run failed" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
