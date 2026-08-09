import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;
type MailMyPDFEnv = { MAILMYPDF_WEBHOOK_SECRET?: string };

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function verifySignature(body: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;

  const fields = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=", 2);
      return [key, value];
    }),
  );

  const timestamp = Number(fields.t);
  const provided = fields.v1;
  if (!Number.isFinite(timestamp) || !provided) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_TIMESTAMP_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function mapStatus(eventType: string, status: string): string {
  if (eventType === "communication.delivered" || status === "delivered") return "delivered";
  if (eventType === "communication.returned" || status === "returned") return "failed";
  if (eventType === "communication.undelivered" || status === "undelivered" || status === "refused") return "failed";
  if (eventType === "communication.in_transit" || status === "in_transit") return "in_transit";
  if (eventType === "communication.sent" || status === "sent") return "submitted";
  return "queued";
}

export async function POST(req: NextRequest) {
  const { env } = getCloudflareContext();
  const secret = ((env as unknown as MailMyPDFEnv).MAILMYPDF_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return errorResponse("NOT_CONFIGURED", "MailMyPDF webhook secret is not configured", 503);

  const body = await req.text();
  if (!verifySignature(body, req.headers.get("X-ProofOfService-Signature"), secret)) {
    return errorResponse("INVALID_SIGNATURE", "Webhook signature verification failed", 401);
  }

  let event: {
    event_id?: string;
    event_type?: string;
    timestamp?: string;
    data?: {
      communication_id?: string;
      status?: string;
      delivered_at?: string | null;
      tracking_number?: string;
      signature_image_url?: string | null;
    };
  };

  try {
    event = JSON.parse(body);
  } catch {
    return errorResponse("INVALID_JSON", "Webhook body is not valid JSON", 400);
  }

  if (!event.event_id || !event.event_type || !event.data?.communication_id) {
    return errorResponse("INVALID_EVENT", "Webhook is missing required event fields", 400);
  }

  try {
    const db = env.DB;
    const communication = await db.prepare(
      `SELECT id, case_id, organization_id, status
         FROM case_communications
        WHERE provider = 'mailmypdf' AND provider_job_id = ?
        LIMIT 1`,
    ).bind(event.data.communication_id).first<{
      id: string;
      case_id: string;
      organization_id: string;
      status: string;
    }>();

    if (!communication) return NextResponse.json({ ok: true, ignored: true }, { status: 202 });

    const inserted = await db.prepare(
      `INSERT OR IGNORE INTO mailmypdf_webhook_events
        (id, organization_id, provider_event_id, event_type, communication_id, received_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      crypto.randomUUID(),
      communication.organization_id,
      event.event_id,
      event.event_type,
      communication.id,
      new Date().toISOString(),
      body,
    ).run();

    if ((inserted.meta?.changes ?? 0) === 0) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    const nextStatus = mapStatus(event.event_type, event.data.status ?? "");
    const now = new Date().toISOString();
    const deliveredAt = event.data.delivered_at ?? (nextStatus === "delivered" ? now : null);

    await db.batch([
      db.prepare(
        `UPDATE case_communications
            SET status = ?,
                tracking_number = COALESCE(?, tracking_number),
                proof_url = COALESCE(?, proof_url),
                delivered_at = COALESCE(?, delivered_at),
                updated_at = ?
          WHERE id = ? AND organization_id = ?`,
      ).bind(
        nextStatus,
        event.data.tracking_number ?? null,
        event.data.signature_image_url ?? null,
        deliveredAt,
        now,
        communication.id,
        communication.organization_id,
      ),
      db.prepare(
        `INSERT INTO events (
          id, case_id, event_type, entity_type, entity_id, actor_type,
          actor_id, actor_name, severity, title, description, payload
        ) VALUES (?, ?, ?, 'communication', ?, 'system', NULL, 'MailMyPDF', ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        communication.case_id,
        event.event_type,
        communication.id,
        nextStatus === "failed" ? "warning" : "info",
        `Mail status: ${nextStatus}`,
        `MailMyPDF reported ${event.event_type}.`,
        body,
      ),
    ]);

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error("[mailmypdf-webhook] processing failed", err);
    return errorResponse("PROCESSING_FAILED", "Could not process MailMyPDF webhook", 500);
  }
}
