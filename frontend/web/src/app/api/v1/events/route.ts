import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import {
  queryEvents,
  getCaseTimeline,
  getCaseRelationships,
  getAuthorityChain,
  type StoredEvent,
  type StoredRelationship,
} from "@/lib/event-store";

export const runtime = "nodejs";

// GET /api/v1/events?caseId=xxx&type=xxx&entityType=xxx&entityId=xxx&limit=100&offset=0
//
// SECURITY: This endpoint requires authentication via requireAuth.
// Case/audit event data can reveal sensitive information, so it must
// be brought under the same authorization boundary as the case endpoints.
export async function GET(req: NextRequest) {
  try {
    // ── Authentication required ──────────────────────────────
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const { env } = getCloudflareContext();
    const db = env.DB;

    const caseId = req.nextUrl.searchParams.get("caseId");
    const eventType = req.nextUrl.searchParams.get("type");
    const entityType = req.nextUrl.searchParams.get("entityType");
    const entityId = req.nextUrl.searchParams.get("entityId");
    const actorType = req.nextUrl.searchParams.get("actorType");
    const severity = req.nextUrl.searchParams.get("severity");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");
    const view = req.nextUrl.searchParams.get("view"); // "timeline" | "audit" | "relationships" | "authority"
    const findingId = req.nextUrl.searchParams.get("findingId");

    // ── Authority Chain view ──
    if (view === "authority" && findingId) {
      const chain = await getAuthorityChain(db, findingId, caseId || '');
      return NextResponse.json({ chain }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── Relationships view ──
    if (view === "relationships" && caseId) {
      const relationships = await getCaseRelationships(db, caseId);
      return NextResponse.json({ relationships }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── Timeline view (timeline-visible events only) ──
    if (view === "timeline" && caseId) {
      const events = await getCaseTimeline(db, caseId, limit);
      return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── Audit view (audit-worthy events only) ──
    if (view === "audit" && caseId) {
      const events = await queryEvents(db, { case_id: caseId, limit, offset });
      return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
    }

    // ── Generic query ──
    const events = await queryEvents(db, {
      event_type: eventType || undefined,
      entity_type: entityType || undefined,
      entity_id: entityId || undefined,
      actor_type: actorType || undefined,
      severity: severity || undefined,
      limit,
      offset,
    });

    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch events" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
