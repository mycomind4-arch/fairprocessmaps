/**
 * POST /api/v1/intelligence/recon
 * 
 * Triggers full multi-agent property intelligence reconnaissance.
 * Runs all 12 agents in parallel, writes results to D1, creates evidence + timeline.
 * 
 * Query params:
 *   projectId - The project to run recon on
 *   force - (optional) If true, re-runs even if already gathered. Default: false
 * 
 * Returns: { success, agentCount, succeeded, failed, noData, results, intelligenceSummary }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runRecon } from "@/lib/recon-agents";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const force = searchParams.get("force") === "true";

  if (!projectId) {
    return NextResponse.json(
      { error: "Missing required parameter: projectId" },
      { status: 400 }
    );
  }

  try {
    const result = await runRecon(projectId, force);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Recon error:", error);
    return NextResponse.json(
      {
        error: "Recon failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
  return POST(request);
}
