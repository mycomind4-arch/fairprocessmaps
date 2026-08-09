import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error: { code, message } }, { status });
}

async function resolveCase(db: D1Database, id: string, organizationId: string) {
  const direct = await db.prepare(
    "SELECT id FROM cases WHERE id = ? AND organization_id = ? LIMIT 1",
  ).bind(id, organizationId).first<{ id: string }>();
  if (direct) return direct.id;

  const legacy = await db.prepare(
    `SELECT cp.case_id FROM case_projects cp
      JOIN projects p ON p.id = cp.project_id
     WHERE p.id = ? AND cp.organization_id = ? LIMIT 1`,
  ).bind(id, organizationId).first<{ case_id: string }>();
  return legacy?.case_id ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const { env } = getCloudflareContext();
    const caseId = await resolveCase(env.DB, id, auth.user.organization_id);
    if (!caseId) return errorResponse("NOT_FOUND", "Case not found", 404);

    const rows = await env.DB.prepare(
      `SELECT id, case_id, title, recipient_name, recipient_company, recipient_address1,
              recipient_address2, recipient_city, recipient_state, recipient_postal_code,
              recipient_country, subject, body, status, created_by, created_at, updated_at, finalized_at
         FROM response_drafts
        WHERE case_id = ? AND organization_id = ? AND status <> 'withdrawn'
        ORDER BY updated_at DESC`,
    ).bind(caseId, auth.user.organization_id).all();

    return NextResponse.json({ ok: true, data: rows.results ?? [], error: null });
  } catch {
    return errorResponse("INTERNAL", "Could not load response drafts", 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const authz = authorize(auth.user, "communication.create");
    if (!authz.allowed) return errorResponse("FORBIDDEN", authz.reason ?? "Forbidden", 403);

    const { id } = await params;
    const { env } = getCloudflareContext();
    const caseId = await resolveCase(env.DB, id, auth.user.organization_id);
    if (!caseId) return errorResponse("NOT_FOUND", "Case not found", 404);

    const payload = await req.json() as {
      title?: string;
      recipient_name?: string;
      recipient_company?: string;
      recipient_address1?: string;
      recipient_address2?: string;
      recipient_city?: string;
      recipient_state?: string;
      recipient_postal_code?: string;
      recipient_country?: string;
      subject?: string;
      body?: string;
    };

    if (!payload.title?.trim() || !payload.body?.trim()) {
      return errorResponse("INVALID_REQUEST", "Title and body are required", 400);
    }

    const draftId = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO response_drafts (
        id, case_id, organization_id, title, recipient_name, recipient_company,
        recipient_address1, recipient_address2, recipient_city, recipient_state,
        recipient_postal_code, recipient_country, subject, body, status, created_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    ).bind(
      draftId, caseId, auth.user.organization_id, payload.title.trim(),
      payload.recipient_name?.trim() ?? null, payload.recipient_company?.trim() ?? null,
      payload.recipient_address1?.trim() ?? null, payload.recipient_address2?.trim() ?? null,
      payload.recipient_city?.trim() ?? null, payload.recipient_state?.trim() ?? null,
      payload.recipient_postal_code?.trim() ?? null, payload.recipient_country?.trim() || "US",
      payload.subject?.trim() ?? null, payload.body.trim(), auth.user.id, now, now,
    ).run();

    await env.DB.prepare(
      `INSERT INTO events (
        id, case_id, event_type, entity_type, entity_id, actor_type, actor_id,
        actor_name, severity, title, description, payload
      ) VALUES (?, ?, 'defense.response_drafted', 'response_draft', ?, 'user', ?, ?, 'info', ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), caseId, draftId, auth.user.id, auth.user.email ?? "User",
      "Response draft created", "A human-reviewable response draft was created from the case record.",
      JSON.stringify({ response_draft_id: draftId }),
    ).run();

    return NextResponse.json({ ok: true, data: { id: draftId, case_id: caseId, status: "draft" }, error: null }, { status: 201 });
  } catch {
    return errorResponse("INTERNAL", "Could not create response draft", 500);
  }
}
