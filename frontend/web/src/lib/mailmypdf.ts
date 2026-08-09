type MailMyPDFDocument = {
  id: string;
  filename: string;
  mime_type: string;
  sha256: string;
};

type MailMyPDFCommunication = {
  id: string;
  status: string;
  provider?: string | null;
  provider_job_id?: string | null;
  tracking_number?: string | null;
  proof_url?: string | null;
};

type MailMyPDFConfig = {
  baseUrl: string;
  apiKey: string;
};

function getConfig(env: unknown): MailMyPDFConfig {
  const source = env as { MAILMYPDF_API_URL?: string; MAILMYPDF_API_KEY?: string };
  const baseUrl = source.MAILMYPDF_API_URL?.replace(/\/$/, "");
  const apiKey = source.MAILMYPDF_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("MailMyPDF integration is not configured");
  }

  return { baseUrl, apiKey };
}

async function request<T>(env: unknown, path: string, init: RequestInit): Promise<T> {
  const config = getConfig(env);
  // Use a plain header record so the request remains inspectable in tests and by
  // adapters while retaining normal Fetch Headers semantics at the network edge.
  const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers).entries());
  headers.Authorization = `Bearer ${config.apiKey}`;
  headers.Accept = "application/json";

  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  const body = await response.text();
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error?: { message?: string } }).error?.message ?? "MailMyPDF request failed")
        : `MailMyPDF request failed (${response.status})`;
    throw new Error(message);
  }

  return parsed as T;
}

export async function uploadDocumentToMailMyPDF(
  env: unknown,
  input: { filename: string; mimeType: string; bytes: Uint8Array },
): Promise<MailMyPDFDocument> {
  const content = Buffer.from(input.bytes).toString("base64");
  return request<MailMyPDFDocument>(env, "/api/v1/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      filename: input.filename,
      mime_type: input.mimeType || "application/pdf",
    }),
  });
}

export async function createMailMyPDFCommunication(
  env: unknown,
  input: {
    idempotencyKey: string;
    documentId: string;
    legalReference: {
      type: "statute" | "lease_clause" | "contract_term" | "regulation" | "ordinance" | "other";
      citation: string;
      description: string;
      response_window_days?: number | null;
    };
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
    metadata?: Record<string, unknown>;
  },
): Promise<MailMyPDFCommunication> {
  return request<MailMyPDFCommunication>(env, "/api/v1/communications", {
    method: "POST",
    headers: {
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
}

export async function getMailMyPDFCommunication(
  env: unknown,
  communicationId: string,
): Promise<MailMyPDFCommunication> {
  return request<MailMyPDFCommunication>(env, `/api/v1/communications/${encodeURIComponent(communicationId)}`, {
    method: "GET",
  });
}
