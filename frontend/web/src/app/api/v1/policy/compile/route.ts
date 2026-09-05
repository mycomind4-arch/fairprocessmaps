import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { compilePolicyPack, type CompileRequest } from "@/lib/policy/compiler";

export const runtime = "nodejs";

// POST /api/v1/policy/compile — draft a policy pack for a new jurisdiction
//
// Returns a DRAFT pack, the rules the validator discarded, and a review
// checklist. The result is never written to the registry and never activated —
// a human commits the pack file after review. Admin-only: drafting procedural
// rules is not an ordinary user action.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "policy.compile");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: "Drafting policy packs requires an administrator." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Each call is a large model request against pasted statute text.
    const limit = await checkRateLimit(req, "policy_compile", 5, 300);
    if (!limit.ok) return limit.response!;

    const body = (await req.json()) as Partial<CompileRequest>;
    const missing = (["jurisdiction", "sourceText", "sourceUrl", "authority"] as const).filter(
      (k) => !body[k],
    );
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missing.join(", ")}` },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();

    const result = await compilePolicyPack(env as never, {
      jurisdiction: body.jurisdiction!,
      caseTypes: body.caseTypes?.length ? body.caseTypes : ["code_enforcement"],
      sourceText: body.sourceText!,
      sourceUrl: body.sourceUrl!,
      authority: body.authority!,
    });

    await emitAuditEvent({
      db: env.DB,
      actor: humanActor(user),
      action: "policy.pack.drafted",
      resourceType: "policy_pack",
      resourceId: result.pack.id,
      detail: JSON.stringify({
        jurisdiction: result.pack.jurisdiction,
        sourceUrl: body.sourceUrl,
        rulesAccepted: result.pack.rules.length,
        rulesRejected: result.rejected.length,
        activationStatus: result.pack.activationStatus,
      }),
    });

    return NextResponse.json(
      {
        ...result,
        nextSteps: [
          `Save the pack to src/lib/policy/packs/${result.pack.id}.json`,
          "Register it in src/lib/policy/registry.ts",
          "Work through reviewChecklist with a qualified attorney",
          "Only then set activationStatus to \"active\"",
        ],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
