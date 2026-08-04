import { NextRequest, NextResponse } from "next/server";
import { runIntelligence } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const result = await runIntelligence(projectId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { message: result.message, projectId, evidenceId: result.evidenceId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
