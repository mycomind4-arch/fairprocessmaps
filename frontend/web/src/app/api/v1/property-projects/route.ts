import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { humanActor, emitTimelineEvent, emitAuditEvent } from "@/lib/security/events";
import { runIntelligence, runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

// GET — list projects for a property (org-scoped)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();

    // Properties are shared, but projects are org-scoped
    const { results } = await env.DB.prepare(
      "SELECT * FROM projects WHERE property_id = ? AND organization_id = ? ORDER BY opened_at DESC",
    )
      .bind(propertyId, user.organization_id)
      .all();

    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

interface CreateProjectBody {
  name: string;
  case_type: string;
  department?: string;
}

// POST — create project (org-scoped, auto-triggers recon + analysis)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await req.json()) as CreateProjectBody;
    if (!body.name?.trim() || !body.case_type) {
      return NextResponse.json(
        { error: "name and case_type are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const authz = requireAuthz(user, "case.update");
    if (!authz.ok) return authz.response;

    const { env, ctx } = getCloudflareContext();
    const db = env.DB;
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO projects (id, property_id, name, case_type, department, organization_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(projectId, propertyId, body.name.trim(), body.case_type, body.department ?? null, user.organization_id)
      .run();

    const created = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();

    // Emit timeline event with actor provenance
    const actor = humanActor(user);
    await emitTimelineEvent({
      db,
      projectId,
      eventDate: now.slice(0, 10),
      eventType: "project_created",
      description: `Project created: ${body.name.trim()}`,
      actor,
    });

    await emitAuditEvent({
      db,
      actor,
      action: "case.update",
      resourceType: "project",
      resourceId: projectId,
      detail: `Project '${body.name.trim()}' created by ${user.name}`,
    });

    // Auto-trigger recon + analysis
    const autoTrigger = Promise.allSettled([
      runIntelligence(projectId),
      runAnalysis(projectId),
    ]);

    if (ctx?.waitUntil) {
      ctx.waitUntil(autoTrigger);
      return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    await autoTrigger;
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
