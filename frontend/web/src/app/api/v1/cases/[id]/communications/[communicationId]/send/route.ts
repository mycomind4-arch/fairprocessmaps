import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { createMailMyPDFCommunication, uploadDocumentToMailMyPDF } from "@/lib/mailmypdf";

export const runtime = "nodejs";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, data: null, error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

function mapMailClass(value: string): "first_class" | "certified" | "certified_return_receipt" | "registered" {
  if (value === "first_class" || value === "certified" || value === "certified_return_receipt" || value === "registered") return value;
  return "certified";
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; communicationId: string }> }) {
  try {
    const { id: caseId, communicationId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const authz = authorize(auth.user, "communication.create");
    if (!authz.allowed) return errorResponse("FORBIDDEN", authz.reason ?? "Forbidden", 403);

    const { env } = getCloudflareContext();
    const db = env.DB;
    const communication = await db.prepare(`SELECT id, case_id, organization_id, purpose, status, mail_class, source_document_id, idempotency_key, recipient_name, recipient_company, recipient_address1, recipient_address2, recipient_city, recipient_state, recipient_postal_code, recipient_country, matter_reference, provider_job_id FROM case_communications WHERE id = ? AND case_id = ? AND organization_id = ? LIMIT 1`).bind(communicationId, caseId, auth.user.organization_id).first<{
      id: string; case_id: string; organization_id: string; purpose: string; status: string; mail_class: string; source_document_id: string | null; idempotency_key: string; recipient_name: string; recipient_company: string | null; recipient_address1: string; recipient_address2: string | null; recipient_city: string; recipient_state: string; recipient_postal_code: string; recipient_country: string; matter_reference: string | null; provider_job_id: string | null;
    }>();
    if (!communication) return errorResponse("NOT_FOUND", "Communication not found", 404);

    if (communication.provider_job_id || ["submitted", "accepted", "in_transit", "delivered"].includes(communication.status)) {
      return NextResponse.json({ ok: true, data: communication, error: null, idempotent_replay: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!communication.source_document_id) return errorResponse("DOCUMENT_REQUIRED", "A source document is required before sending", 400);

    const evidence = await db.prepare(`SELECT id, r2_key, title, status, mime_type FROM evidence WHERE id = ? AND case_id = ? AND organization_id = ? LIMIT 1`).bind(communication.source_document_id, communication.case_id, communication.organization_id).first<{ id: string; r2_key: string | null; title: string; status: string; mime_type: string | null }>();
    if (!evidence) return errorResponse("DOCUMENT_NOT_FOUND", "Source evidence was not found for this case", 404);
    if (evidence.status === "withdrawn") return errorResponse("DOCUMENT_WITHDRAWN", "Source evidence has been withdrawn", 409);
    if (!evidence.r2_key) return errorResponse("DOCUMENT_FILE_MISSING", "Source evidence has no stored file", 404);

    const object = await env.EVIDENCE_BUCKET.get(evidence.r2_key);
    if (!object) return errorResponse("DOCUMENT_FILE_MISSING", "Source evidence file was not found", 404);
    const bytes = new Uint8Array(await object.arrayBuffer());
    const filename = `${evidence.title.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-") || communication.id}.pdf`;
    const mimeType = evidence.mime_type ?? "application/pdf";

    const mailDocument = await uploadDocumentToMailMyPDF(env, { filename, mimeType, bytes });
    const mailCommunication = await createMailMyPDFCommunication(env, {
      idempotencyKey: communication.idempotency_key,
      documentId: mailDocument.id,
      legalReference: { type: "other", citation: communication.matter_reference ?? communication.case_id, description: communication.purpose },
      recipient: { name: communication.recipient_name, address_line1: communication.recipient_address1, address_line2: communication.recipient_address2, city: communication.recipient_city, state: communication.recipient_state, postal_code: communication.recipient_postal_code, country: communication.recipient_country },
      mailType: mapMailClass(communication.mail_class),
      matterReference: communication.matter_reference ?? communication.case_id,
      matterType: "fairprocessmaps_case",
      metadata: { fairprocessmaps_case_id: communication.case_id, fairprocessmaps_communication_id: communication.id, organization_id: communication.organization_id },
    });

    const nextStatus = mailCommunication.status || "submitted";
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(`UPDATE case_communications SET provider = 'mailmypdf', provider_job_id = ?, status = ?, tracking_number = ?, proof_url = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND case_id = ? AND organization_id = ?`).bind(mailCommunication.provider_job_id ?? mailCommunication.id, nextStatus, mailCommunication.tracking_number ?? null, mailCommunication.proof_url ?? null, now, now, communication.id, communication.case_id, communication.organization_id),
      db.prepare(`INSERT INTO events (id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, actor_name, severity, title, description, payload) VALUES (?, ?, 'mail_job.submitted', 'communication', ?, 'system', NULL, 'MailMyPDF', 'info', ?, ?, ?)`).bind(crypto.randomUUID(), communication.case_id, communication.id, "Mail submitted", "The response packet was submitted to MailMyPDF for physical mailing.", JSON.stringify({ communication_id: communication.id, provider: "mailmypdf", provider_job_id: mailCommunication.provider_job_id ?? mailCommunication.id })),
    ]);

    return NextResponse.json({ ok: true, data: { id: communication.id, case_id: communication.case_id, status: nextStatus, provider: "mailmypdf", provider_job_id: mailCommunication.provider_job_id ?? mailCommunication.id, tracking_number: mailCommunication.tracking_number ?? null, proof_url: mailCommunication.proof_url ?? null }, error: null }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send communication";
    return errorResponse("MAIL_PROVIDER_ERROR", message, 502);
  }
}
