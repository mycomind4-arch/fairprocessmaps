import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysis } from "@/lib/auto-triggers";
import { getCaseTimeline, eventToTimelineDisplay, emitEvent } from "@/lib/event-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // ── Query traditional timeline_events ──
    const result = await db
      .prepare(
        `SELECT t.id, t.event_date, t.event_type, t.description, t.evidence_id,
                e.title AS evidence_title
         FROM timeline_events t
         LEFT JOIN evidence e ON t.evidence_id = e.id
         WHERE t.project_id = ?
         ORDER BY t.event_date DESC`
      )
      .bind(projectId)
      .all();

    const timelineItems = (result.results ?? []) as any[];

    // ── Query events from the Event Store ──
    let eventStoreItems: any[] = [];
    try {
      const events = await getCaseTimeline(db, projectId, 200);
      eventStoreItems = events.map((e) => {
        const display = eventToTimelineDisplay(e);
        return {
          id: e.id,
          event_date: e.created_at,
          event_type: display.event_type,
          description: display.title,
          evidence_id: e.entity_type === "evidence" ? e.entity_id : null,
          evidence_title: null, // could be joined later
          _from_event_store: true,
          _entity_type: e.entity_type,
          _entity_id: e.entity_id,
        };
      });
    } catch {
      // Event store might not be migrated yet — that's OK
    }

    // ── Merge: deduplicate by type+description, prefer event store for auto-generated events ──
    const merged = [...timelineItems, ...eventStoreItems];
    // Sort by date descending
    merged.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    return NextResponse.json({ items: merged }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
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
  "intelligence_gathered", "project_created", "other",
];

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = (await req.json()) as AddEventBody;
    if (!body.event_date || !body.event_type) {
      return NextResponse.json({ error: "event_date and event_type are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    // Normalize event_type to lowercase, default to "other" if not in valid list
    const eventType = body.event_type.toLowerCase().replace(/\s+/g, "_");
    const validType = VALID_EVENT_TYPES.includes(eventType) ? eventType : "other";

    const { env } = getCloudflareContext();
    const db = env.DB;

    const id = crypto.randomUUID();

    await db
      .prepare(
        `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, projectId, body.evidence_id ?? null, body.event_date, validType, body.description ?? null)
      .run();

    // ── Also emit to the Event Store ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "case.updated",
      entity_type: "timeline_event",
      entity_id: id,
      actor_type: "user",
      title: body.description || `Timeline event: ${validType}`,
      payload: { event_date: body.event_date, event_type: validType, evidence_id: body.evidence_id },
    });

    // Auto-trigger analysis after adding a timeline event
    let analysisResult = null;
    try {
      analysisResult = await runAnalysis(projectId);
    } catch {}

    return NextResponse.json(
      { id, analysis: analysisResult },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const eventId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!eventId || !projectId) {
      return NextResponse.json({ error: "id and projectId are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    await db
      .prepare("DELETE FROM timeline_events WHERE id = ? AND project_id = ?")
      .bind(eventId, projectId)
      .run();

    // Re-run analysis after deleting an event
    let analysisResult = null;
    try {
      analysisResult = await runAnalysis(projectId);
    } catch {}

    return NextResponse.json({ deleted: true, analysis: analysisResult }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
