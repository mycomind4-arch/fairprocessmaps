import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { allPacks } from "@/lib/policy/registry";
import { buildReviewChecklist } from "@/lib/policy/compiler";

export const runtime = "nodejs";

// GET /api/v1/policy/packs — what rules are in force, and what is still unreviewed
//
// Readable by anyone who can read a case. If a finding renders as provisional,
// the person looking at it should be able to find out exactly which parameter
// is unverified and what a reviewer still has to confirm. Hiding that behind an
// admin role would make the provisional badge unactionable.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "finding.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const packs = allPacks().map((pack) => {
      const unverified = pack.rules.filter((r) =>
        (r.notes ?? "").toUpperCase().includes("UNVERIFIED"),
      );

      return {
        id: pack.id,
        jurisdiction: pack.jurisdiction,
        caseTypes: pack.caseTypes,
        policyVersion: pack.policyVersion,
        activationStatus: pack.activationStatus,
        reviewedBy: pack.reviewedBy ?? null,
        reviewedAt: pack.reviewedAt ?? null,
        ruleCount: pack.rules.length,
        unverifiedCount: unverified.length,
        rules: pack.rules.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          description: r.description,
          severity: r.severity,
          citation: r.citation,
          sourceUrl: r.sourceUrl,
          authority: r.authority,
          minCalendarDays: r.minCalendarDays ?? null,
          notes: r.notes ?? null,
          unverified: (r.notes ?? "").toUpperCase().includes("UNVERIFIED"),
        })),
        reviewChecklist: buildReviewChecklist(pack),
      };
    });

    return NextResponse.json(
      {
        packs,
        // Surfaced so a caller does not have to derive it from the list.
        anyProvisional: packs.some((p) => p.activationStatus !== "active"),
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
