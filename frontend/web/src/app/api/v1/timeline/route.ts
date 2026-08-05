import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitTimelineEvent, emitAuditEvent } from "@/lib/security/events";
import { runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

// GET — list timeline events (org-scoped)
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await db
      .prepare(
        `SELECT t.id, t.event_date, t.event_type, t.description, t.evidence_id,
                t.actor_type, t.actor_id, t.actor_organization_id,
                e.title AS evidence_title
         FROM timeline_events t
         LEFT JOIN evidence e ON t.evidence_id = e.id
         WHERE t.project_id = ? AND t.organization_id = ?
         ORDER BY t.event_date DESC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    return NextResponse.json(
      { items: result.results ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

interface AddEventBody {
  event_date: string;
  event_type: string;
  description?: string;
  evidence_id?: string;
}

const VALID_EVENT_TYPES = [
  "notice_sent", "hearing_held", "appeal_filed", "deadline",
  "correspondence", "inspection", "decision", "fine_imposed",
  "lien_filed", "abatement", "eviction", "evidence_uploaded",
  "evidence_withdrawn", "intelligence_gathered", "project_created", "other",
];

// POST — add timeline event with actor provenance
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Verify project org
    const projectOrg = await resolveProjectOrg(db, projectId);
    const authz = requireAuthz(user, "case.update", {
      organization_id: projectOrg ?? undefined,
    });
    if (!authz.ok) return authz.response;

    const body = (await req.json()) as AddEventBody;
    if (!body.event_date || !body.event_type) {
      return NextResponse.json(
        { error: "event_date and event_type are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const eventType = body.event_type.toLowerCase().replace(/\s+/g, "_");
    const validType = VALID_EVENT_TYPES.includes(eventType) ? eventType : "other";

    // Emit with actor provenance
    const actor = humanActor(user);
    const id = await emitTimelineEvent({
      db,
      projectId,
      evidenceId: body.evidence_id,
      eventDate: body.event_date,
      eventType: validType,
      description: body.description ?? "",
      actor,
    });

    // Emit audit event
    await emitAuditEvent({
      db,
      actor,
      action: "event.create",
      resourceType: "timeline_event",
      resourceId: id,
      detail: `Timeline event '${validType}' added by ${user.name}`,
    });

    // Auto-trigger analysis
    let analysisResult = null;
    try {
      analysisResult = await runAnalysis(projectId);
    } catch {}

    return NextResponse.json(
      { id, analysis: analysisResult },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// DELETE — remove timeline event (org-scoped)
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const eventId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!eventId || !projectId) {
      return NextResponse.json(
        { error: "id and projectId are required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped delete
    await db
      .prepare("DELETE FROM timeline_events WHERE id = ? AND project_id = ? AND organization_id = ?")
      .bind(eventId, projectId, user.organization_id)
      .run();

    // Emit audit event
    const actor = humanActor(user);
    await emitAuditEvent({
      db,
      actor,
      action: "event.delete",
      resourceType: "timeline_event",
      resourceId: eventId,
      detail: `Timeline event deleted by ${user.name}`,
    });

    let analysisResult = null;
    try {
      analysisResult = await runAnalysis(projectId);
    } catch {}

    return NextResponse.json(
      { deleted: true, analysis: analysisResult },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
