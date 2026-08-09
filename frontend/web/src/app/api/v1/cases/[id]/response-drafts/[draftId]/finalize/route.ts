import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { renderResponsePdf } from "@/lib/response-pdf";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error: { code, message } }, { status });
}

async function resolveCase(db: D1Database, id: string, organizationId: string) {
  const direct = await db.prepare("SELECT id FROM cases WHERE id = ? AND organization_id = ? LIMIT 1").bind(id, organizationId).first<{ id: string }>();
  if (direct) return direct.id;
  const legacy = await db.prepare(`SELECT cp.case_id FROM case_projects cp JOIN projects p ON p.id = cp.project_id WHERE p.id = ? AND cp.organization_id = ? LIMIT 1`).bind(id, organizationId).first<{ case_id: string }>();
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

    const draft = await env.DB.prepare(`SELECT * FROM response_drafts WHERE id = ? AND case_id = ? AND organization_id = ? AND status <> 'withdrawn' LIMIT 1`).bind(draftId, caseId, auth.user.organization_id).first<Record<string, unknown>>();
    if (!draft) return errorResponse("NOT_FOUND", "Response draft not found", 404);

    const existing = await env.DB.prepare(`SELECT id, title, status, r2_key, mime_type, file_size FROM evidence WHERE response_draft_id = ? AND case_id = ? AND organization_id = ? LIMIT 1`).bind(draftId, caseId, auth.user.organization_id).first<Record<string, unknown>>();
    if (existing) {
      const finalizedAt = String(draft.finalized_at ?? new Date().toISOString());
      if (draft.status !== "finalized") await env.DB.prepare(`UPDATE response_drafts SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ? AND case_id = ? AND organization_id = ?`).bind(finalizedAt, finalizedAt, draftId, caseId, auth.user.organization_id).run();
      return NextResponse.json({ ok: true, data: { ...draft, status: "finalized", finalized_at: finalizedAt, evidence: existing }, error: null });
    }

    const now = new Date().toISOString();
    const pdf = renderResponsePdf({ title: String(draft.title ?? "Response"), recipientName: draft.recipient_name as string | null, recipientCompany: draft.recipient_company as string | null, recipientAddress1: draft.recipient_address1 as string | null, recipientAddress2: draft.recipient_address2 as string | null, recipientCity: draft.recipient_city as string | null, recipientState: draft.recipient_state as string | null, recipientPostalCode: draft.recipient_postal_code as string | null, subject: draft.subject as string | null, body: String(draft.body ?? ""), finalizedAt: now });

    const project = await env.DB.prepare(`SELECT cp.project_id FROM case_projects cp JOIN projects p ON p.id = cp.project_id WHERE cp.case_id = ? AND cp.organization_id = ? ORDER BY CASE WHEN cp.role = 'primary' THEN 0 ELSE 1 END LIMIT 1`).bind(caseId, auth.user.organization_id).first<{ project_id: string }>();
    if (!project) return errorResponse("CONFLICT", "Case has no legacy project anchor for evidence storage", 409);

    const evidenceId = crypto.randomUUID();
    const r2Key = `organizations/${auth.user.organization_id}/cases/${caseId}/responses/${draftId}.pdf`;
    await env.EVIDENCE_BUCKET.put(r2Key, pdf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { caseId, organizationId: auth.user.organization_id, responseDraftId: draftId } });
    await env.DB.prepare(`INSERT INTO evidence (id, project_id, source, doc_type, title, status, r2_key, case_id, organization_id, response_draft_id, mime_type, file_size, generated_at) VALUES (?, ?, 'generated_response', 'response', ?, 'verified', ?, ?, ?, ?, 'application/pdf', ?, ?)`).bind(evidenceId, project.project_id, draft.title, r2Key, caseId, auth.user.organization_id, draftId, pdf.byteLength, now).run();
    await env.DB.prepare(`UPDATE response_drafts SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ? AND case_id = ? AND organization_id = ?`).bind(now, now, draftId, caseId, auth.user.organization_id).run();
    await env.DB.prepare(`INSERT INTO events (id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, actor_name, severity, title, description, payload) VALUES (?, ?, 'defense.response_finalized', 'response_draft', ?, 'user', ?, ?, 'info', ?, ?, ?)`).bind(crypto.randomUUID(), caseId, draftId, auth.user.id, auth.user.email ?? "User", "Response finalized", "A response was finalized and captured as a case evidence artifact.", JSON.stringify({ response_draft_id: draftId, evidence_id: evidenceId, r2_key: r2Key })).run();

    return NextResponse.json({ ok: true, data: { ...draft, status: "finalized", finalized_at: now, evidence: { id: evidenceId, title: draft.title, r2_key: r2Key, mime_type: "application/pdf", file_size: pdf.byteLength } }, error: null });
  } catch (error) {
    console.error("response finalization failed", error);
    return errorResponse("INTERNAL", "Could not finalize response draft", 500);
  }
}
