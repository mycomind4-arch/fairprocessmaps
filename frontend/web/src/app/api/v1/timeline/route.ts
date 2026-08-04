import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysis } from "@/lib/auto-triggers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

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

    return NextResponse.json({ items: result.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
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
