import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runIntelligence, runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const { results } = await env.DB.prepare(
      "SELECT * FROM projects WHERE property_id = ? ORDER BY opened_at DESC"
    )
      .bind(propertyId)
      .all();
    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

interface CreateProjectBody {
  name: string;
  case_type: string;
  department?: string;
}

export async function POST(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = (await req.json()) as CreateProjectBody;
    if (!body.name?.trim() || !body.case_type) {
      return NextResponse.json({ error: "name and case_type are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env, ctx } = getCloudflareContext();
    const projectId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO projects (id, property_id, name, case_type, department)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(projectId, propertyId, body.name.trim(), body.case_type, body.department ?? null)
      .run();

    const created = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();

    // ── Auto-trigger full 12-agent recon + analysis ──
    // runIntelligence now delegates to runRecon() which runs all agents in parallel.
    // Analysis runs after recon completes.
    const autoTrigger = Promise.allSettled([
      runIntelligence(projectId),
      runAnalysis(projectId),
    ]);

    if (ctx?.waitUntil) {
      ctx.waitUntil(autoTrigger);
      return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    // Fallback: run inline if no ctx.waitUntil
    await autoTrigger;
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
