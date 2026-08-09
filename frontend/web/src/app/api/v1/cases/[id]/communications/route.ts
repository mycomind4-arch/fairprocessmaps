import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";

interface CommunicationInput {
  purpose: string;
  mail_class?: string;
  source_document_id?: string;
  recipient_name: string;
  recipient_company?: string;
  recipient_address1: string;
  recipient_address2?: string;
  recipient_city: string;
  recipient_state: string;
  recipient_postal_code: string;
  recipient_country?: string;
  matter_reference?: string;
  metadata?: Record<string, unknown>;
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { ok: false, data: null, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const authz = authorize(auth.user, "communication.read");
    if (!authz.allowed) return errorResponse("FORBIDDEN", authz.reason ?? "Forbidden", 403);
    const { env } = getCloudflareContext();
    const caseRow = await env.DB.prepare("SELECT id FROM cases WHERE id = ? AND organization_id = ? LIMIT 1").bind(caseId, auth.user.organization_id).first<{ id: string }>();
    if (!caseRow) return errorResponse("NOT_FOUND", "Case not found", 404);
    const rows = await env.DB.prepare(`SELECT id, case_id, purpose, status, mail_class, source_document_id, provider, provider_job_id, recipient_name, recipient_company, recipient_address1, recipient_address2, recipient_city, recipient_state, recipient_postal_code, recipient_country, matter_reference, tracking_number, proof_url, error_code, error_message, created_at, submitted_at, accepted_at, delivered_at, updated_at FROM case_communications WHERE case_id = ? AND organization_id = ? ORDER BY created_at DESC`).bind(caseId, auth.user.organization_id).all();
    return NextResponse.json({ ok: true, data: rows.results ?? [], error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("INTERNAL", "Could not load communications", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const authz = authorize(auth.user, "communication.create");
    if (!authz.allowed) return errorResponse("FORBIDDEN", authz.reason ?? "Forbidden", 403);

    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) return errorResponse("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is required and must be 200 characters or fewer", 400);

    const input = (await req.json()) as Partial<CommunicationInput>;
    const required = ["purpose", "recipient_name", "recipient_address1", "recipient_city", "recipient_state", "recipient_postal_code"] as const;
    for (const field of required) if (!input[field] || typeof input[field] !== "string") return errorResponse("VALIDATION_ERROR", `${field} is required`, 400);

    const { env } = getCloudflareContext();
    const db = env.DB;
    const caseRow = await db.prepare("SELECT id FROM cases WHERE id = ? AND organization_id = ? LIMIT 1").bind(caseId, auth.user.organization_id).first<{ id: string }>();
    if (!caseRow) return errorResponse("NOT_FOUND", "Case not found", 404);

    if (input.source_document_id) {
      const evidence = await db.prepare(`SELECT id FROM evidence WHERE id = ? AND case_id = ? AND organization_id = ? AND status <> 'withdrawn' LIMIT 1`).bind(input.source_document_id, caseId, auth.user.organization_id).first<{ id: string }>();
      if (!evidence) return errorResponse("INVALID_SOURCE_DOCUMENT", "The selected source document is not part of this case or is no longer available", 400);
    }

    const existing = await db.prepare(`SELECT id, status, provider, provider_job_id FROM case_communications WHERE organization_id = ? AND idempotency_key = ? LIMIT 1`).bind(auth.user.organization_id, idempotencyKey).first();
    if (existing) return NextResponse.json({ ok: true, data: existing, error: null, idempotent_replay: true }, { headers: { "Cache-Control": "no-store", "Idempotency-Replayed": "true" } });

    const communicationId = crypto.randomUUID();
    const now = new Date().toISOString();
    const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
    await db.batch([
      db.prepare(`INSERT INTO case_communications (id, case_id, organization_id, purpose, status, mail_class, source_document_id, provider, idempotency_key, recipient_name, recipient_company, recipient_address1, recipient_address2, recipient_city, recipient_state, recipient_postal_code, recipient_country, matter_reference, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(communicationId, caseId, auth.user.organization_id, input.purpose, input.mail_class ?? "certified", input.source_document_id ?? null, idempotencyKey, input.recipient_name, input.recipient_company ?? null, input.recipient_address1, input.recipient_address2 ?? null, input.recipient_city, input.recipient_state, input.recipient_postal_code, input.recipient_country ?? "US", input.matter_reference ?? null, metadata, now, now),
      db.prepare(`INSERT INTO events (id, case_id, event_type, entity_type, entity_id, actor_type, actor_id, actor_name, severity, title, description, payload) VALUES (?, ?, 'mail_job.created', 'communication', ?, 'user', ?, ?, 'info', ?, ?, ?)`).bind(crypto.randomUUID(), caseId, communicationId, auth.user.id, auth.user.name, "Mail job created", "A physical-mail communication was prepared for this case.", JSON.stringify({ communication_id: communicationId, purpose: input.purpose, source_document_id: input.source_document_id ?? null })),
    ]);

    return NextResponse.json({ ok: true, data: { id: communicationId, case_id: caseId, status: "draft" }, error: null }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create communication";
    if (message.toLowerCase().includes("idx_case_comm_idempotency")) return errorResponse("IDEMPOTENCY_CONFLICT", "The communication already exists; retry the request to retrieve it", 409);
    return errorResponse("INTERNAL", "Could not create communication", 500);
  }
}
