import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  generateBrief,
  listBriefs,
  getBrief,
  type BriefType,
} from "@/lib/brief-generator";

export const runtime = "nodejs";

// POST /api/v1/cases/[id]/brief — Generate a new brief
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Rate limit: 10 brief generations per minute
    const limit = await checkRateLimit(
      req,
      "brief_generate",
      10,
      60,
    );
    if (!limit.ok) return limit.response!;

    const body = (await req.json()) as {
      brief_type?: BriefType;
      defendant_name?: string;
      case_number?: string;
      court_name?: string;
    };

    if (!body.brief_type || !["motion_to_dismiss", "appeal_letter", "complaint", "case_summary"].includes(body.brief_type)) {
      return NextResponse.json(
        { error: "brief_type is required (motion_to_dismiss, appeal_letter, complaint, or case_summary)" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const result = await generateBrief({
      db: env.DB,
      projectId: id,
      organizationId: auth.user.organization_id,
      briefType: body.brief_type,
      defendantName: body.defendant_name,
      caseNumber: body.case_number,
      courtName: body.court_name,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      { brief: result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Brief generation failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// GET /api/v1/cases/[id]/brief — List briefs or get specific brief
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const { env } = getCloudflareContext();
    const briefId = req.nextUrl.searchParams.get("briefId");

    if (briefId) {
      // Get a specific brief with full content
      const brief = await getBrief(env.DB, briefId, auth.user.organization_id);
      if (!brief) {
        return NextResponse.json(
          { error: "Brief not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { brief },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    // List all briefs for this case
    const briefs = await listBriefs(env.DB, id, auth.user.organization_id);
    return NextResponse.json(
      { briefs },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to retrieve briefs" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
