import { getCloudflareContext } from "@opennextjs/cloudflare";

interface MailMyPdfEnv {
  MAILMYPDF_API_URL?: string;
  MAILMYPDF_API_KEY?: string;
}

export interface MailMyPdfDocument {
  id: string;
  filename: string;
  mime_type: string;
  sha256: string;
  size_bytes: number;
}

export interface MailMyPdfCommunication {
  id: string;
  status: string;
  provider?: string | null;
  provider_job_id?: string | null;
  tracking_number?: string | null;
  proof_url?: string | null;
}

function getConfig(): MailMyPdfEnv {
  const { env } = getCloudflareContext();
  return env as unknown as MailMyPdfEnv;
}

function apiUrl(path: string): string {
  const env = getConfig();
  const base = (env.MAILMYPDF_API_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("MAILMYPDF_API_URL is not configured");
  return `${base}${path}`;
}

function authHeaders(): HeadersInit {
  const env = getConfig();
  if (!env.MAILMYPDF_API_KEY) throw new Error("MAILMYPDF_API_KEY is not configured");
  return { Authorization: `Bearer ${env.MAILMYPDF_API_KEY}` };
}

export async function uploadDocument(input: {
  filename: string;
  content: Uint8Array;
  mimeType?: string;
}): Promise<MailMyPdfDocument> {
  const response = await fetch(apiUrl("/api/v1/documents"), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: input.filename,
      mime_type: input.mimeType ?? "application/pdf",
      content: Buffer.from(input.content).toString("base64"),
    }),
  });

  const payload = await response.json() as { id?: string; filename?: string; mime_type?: string; sha256?: string; size_bytes?: number; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? `MailMyPDF document upload failed (${response.status})`);
  }
  return payload as MailMyPdfDocument;
}

export async function createCommunication(input: {
  documentId: string;
  recipient: {
    name: string;
    address_line1: string;
    address_line2?: string | null;
    city: string;
    state: string;
    postal_code: string;
    country?: string;
  };
  mailType: "first_class" | "certified" | "certified_return_receipt" | "registered";
  matterReference: string;
  matterType: string;
  legalReference: {
    type: "statute" | "lease_clause" | "contract_term" | "regulation" | "ordinance" | "other";
    citation: string;
    description: string;
    response_window_days?: number | null;
    notes?: string;
  };
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<MailMyPdfCommunication> {
  const response = await fetch(apiUrl("/api/v1/communications"), {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      idempotency_key: input.idempotencyKey,
      document_id: input.documentId,
      legal_reference: input.legalReference,
      recipient: input.recipient,
      mail_type: input.mailType,
      matter_reference: input.matterReference,
      matter_type: input.matterType,
      metadata: input.metadata,
    }),
  });

  const payload = await response.json() as MailMyPdfCommunication & { error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message ?? `MailMyPDF communication failed (${response.status})`);
  }
  return payload;
}

export async function getCommunication(id: string): Promise<MailMyPdfCommunication> {
  const response = await fetch(apiUrl(`/api/v1/communications/${encodeURIComponent(id)}`), {
    headers: authHeaders(),
    cache: "no-store",
  });
  const payload = await response.json() as MailMyPdfCommunication & { error?: { message?: string } };
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? `MailMyPDF lookup failed (${response.status})`);
  return payload;
}
