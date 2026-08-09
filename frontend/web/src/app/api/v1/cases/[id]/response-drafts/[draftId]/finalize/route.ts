import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error: { code, message } }, { status });
}

async function resolveCase(db: D1Database, id: string, organizationId: string) {
  const direct = await db.prepare("SELECT id FROM cases WHERE id = ? AND organization_id = ? LIMIT 1")
    .bind(id, organizationId).first<{ id: string }>();
  if (direct) return direct.id;
  const legacy = await db.prepare(`SELECT cp.case_id FROM case_projects cp JOIN projects p ON p.id = cp.project_id WHERE p.id = ? AND cp.organization_id = ? LIMIT 1`)
    .bind(id, organizationId).first<{ case_id: string }>();
  return legacy?.case_id ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const authz = authorize(auth.user, "communication.create");
    if (!authz.allowed) return errorResponse("FORBIDDEN", authz.reason ?? "Forbidden", 403);

    const { id, draftId } = await params;
    const { env } = getCloudflareContext();
    const caseId = await resolveCase(env.DB, id, auth.user.organization_id);
    if (!caseId) return errorResponse("NOT_FOUND", "Case not found", 404);

    const draft = await env.DB.prepare(`SELECT * FROM response_drafts WHERE id = ? AND case_id = ? AND organization_id = ? AND status <> 'withdrawn' LIMIT 1`)
      .bind(draftId, caseId, auth.user.organization_id).first<Record<string, unknown>>();
    if (!draft) return errorResponse("NOT_FOUND", "Response draft not found", 404);
    if (draft.status === "finalized") return NextResponse.json({ ok: true, data: draft, error: null });

    const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE response_drafts SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ? AND case_id = ? AND organization_id = ?`)
      .bind(now, now, draftId, caseId, auth.user.organization_id).run();

    await env.DB.prepare(`INSERT INTO events (id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, actor_name, severity, title, description, payload)
      VALUES (?, ?, 'defense.response_finalized', 'response_draft', ?, 'user', ?, ?, 'info', ?, ?, ?)`)
      .bind(crypto.randomUUID(), caseId, draftId, auth.user.id, auth.user.email ?? "User", "Response finalized", "A response draft was marked final and is ready for document capture.", JSON.stringify({ response_draft_id: draftId })).run();

    return NextResponse.json({ ok: true, data: { ...draft, status: "finalized", finalized_at: now }, error: null });
  } catch {
    return errorResponse("INTERNAL", "Could not finalize response draft", 500);
  }
}
