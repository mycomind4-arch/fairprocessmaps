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

    // ── Query legacy timeline_events (historical data) ──
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

    const legacyItems = (result.results ?? []) as any[];

    // ── Query events from the Event Store (canonical source) ──
    let eventStoreItems: any[] = [];
    try {
      const events = await getCaseTimeline(db, projectId, 200);
      eventStoreItems = events.map((e) => {
        const display = eventToTimelineDisplay(e);
        return {
          id: e.id,
          event_date: display.event_date, // Uses event_date (action date) with created_at fallback
          event_type: display.event_type,
          description: display.title,
          evidence_id: e.entity_type === "evidence" ? e.entity_id : null,
          evidence_title: null,
          _from_event_store: true,
          _entity_type: e.entity_type,
          _entity_id: e.entity_id,
        };
      });
    } catch {
      // Event store might not be migrated yet
    }

    // ── Deduplicate: if the same (event_type + description) exists in both sources,
    //    prefer the event store version (it has richer metadata). ──
    const eventStoreKeys = new Set(
      eventStoreItems.map((e) => `${e.event_type}::${e.description}`)
    );
    const dedupedLegacy = legacyItems.filter((l) => {
      const key = `${l.event_type}::${l.description}`;
      return !eventStoreKeys.has(key);
    });

    // ── Merge and sort by event_date (action date) descending ──
    const merged = [...dedupedLegacy, ...eventStoreItems];
    merged.sort((a, b) => {
      const dateA = new Date(a.event_date).getTime() || 0;
      const dateB = new Date(b.event_date).getTime() || 0;
      return dateB - dateA;
    });

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

    const eventType = body.event_type.toLowerCase().replace(/\s+/g, "_");
    const validType = VALID_EVENT_TYPES.includes(eventType) ? eventType : "other";

    const { env } = getCloudflareContext();
    const db = env.DB;

    const id = crypto.randomUUID();

    // Still create timeline_events row (user-facing manual events continue to use legacy table)
    await db
      .prepare(
        `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, projectId, body.evidence_id ?? null, body.event_date, validType, body.description ?? null)
      .run();

    // ── Also emit to the Event Store with the user-specified event_date ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "case.updated",
      entity_type: "timeline_event",
      entity_id: id,
      actor_type: "user",
      event_date: body.event_date,
      title: body.description || `Timeline event: ${validType}`,
      payload: { event_date: body.event_date, event_type: validType, evidence_id: body.evidence_id },
    });

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

    let analysisResult = null;
    try {
      analysisResult = await runAnalysis(projectId);
    } catch {}

    return NextResponse.json({ deleted: true, analysis: analysisResult }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
