/**
 * Lob mail provider.
 *
 * Lob prints and mails physical letters via its API, including USPS certified
 * mail with return receipt — which is what makes it useful here. An agency
 * response is only as good as the sender's ability to prove it arrived, and a
 * green card scan is the artifact that does that.
 *
 * Notes on the integration that matter more than the endpoints:
 *
 *   - `certified_return_receipt` is the default for anything legally operative.
 *     First-class is cheaper and worthless in a dispute about service.
 *   - Lob honors an `Idempotency-Key` header. We pass the caller's key through,
 *     so a retried send does not produce a second letter. Duplicate filings
 *     confuse a record and can look like bad faith.
 *   - Address verification runs before send. An undeliverable response is a
 *     response never sent, and the deadline does not pause for the envelope to
 *     come back.
 *
 * Test mode: a `test_` API key exercises the whole path without mailing
 * anything. Use it until someone has watched a real letter arrive.
 */

import type {
  AddressVerification,
  MailAddress,
  MailProvider,
  MailStatus,
  SendMailRequest,
  SendMailResult,
} from "./provider";

const LOB_API = "https://api.lob.com/v1";

export interface LobEnv {
  LOB_API_KEY?: string;
  LOB_API_URL?: string;
}

function requireKey(env: LobEnv): string {
  const key = typeof env.LOB_API_KEY === "string" ? env.LOB_API_KEY.trim() : "";
  if (!key) throw new Error("LOB_API_KEY is not configured");
  return key;
}

/** Lob authenticates with HTTP Basic using the API key as the username. */
function authHeader(key: string): string {
  return `Basic ${btoa(`${key}:`)}`;
}

function toLobAddress(a: MailAddress) {
  return {
    name: a.name,
    company: a.company ?? undefined,
    address_line1: a.address1,
    address_line2: a.address2 ?? undefined,
    address_city: a.city,
    address_state: a.state,
    address_zip: a.postalCode,
    address_country: a.country ?? "US",
  };
}

/**
 * Map our mail classes onto Lob's certified-mail options.
 *
 * Lob expresses certified mail as an `extra_service` on a letter rather than a
 * distinct mail class, so the two fields move together.
 */
function mailOptions(mailClass: SendMailRequest["mailClass"]) {
  switch (mailClass) {
    case "certified_return_receipt":
      return { extra_service: "certified_return_receipt" as const };
    case "certified":
      return { extra_service: "certified" as const };
    case "priority":
    case "first_class":
    default:
      return {};
  }
}

async function lobFetch<T>(
  env: LobEnv,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const key = requireKey(env);
  const base = env.LOB_API_URL?.trim() || LOB_API;

  const headers: Record<string, string> = {
    Authorization: authHeader(key),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${base}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Lob request failed (${res.status}) on ${path}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export class LobProvider implements MailProvider {
  readonly id = "lob";

  constructor(private readonly env: LobEnv) {}

  async verifyAddress(address: MailAddress): Promise<AddressVerification> {
    type LobVerify = {
      deliverability?: string;
      primary_line?: string;
      secondary_line?: string;
      components?: { city?: string; state?: string; zip_code?: string; zip_code_plus_4?: string };
      deliverability_analysis?: Record<string, unknown>;
    };

    const body = new URLSearchParams({
      primary_line: address.address1,
      city: address.city,
      state: address.state,
      zip_code: address.postalCode,
    });
    if (address.address2) body.set("secondary_line", address.address2);

    const result = await lobFetch<LobVerify>(this.env, "/us_verifications", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    // Lob returns "deliverable", "deliverable_unnecessary_unit",
    // "deliverable_incorrect_unit", "deliverable_missing_unit", or
    // "undeliverable". Only the last is a hard stop; the middle three deliver
    // but signal a unit problem worth surfacing.
    const d = result.deliverability ?? "unknown";
    const deliverable = d !== "undeliverable" && d !== "unknown";

    const messages: string[] = [];
    if (!deliverable) {
      messages.push(
        `Lob reports this address as ${d}. A response sent here will likely be returned.`,
      );
    } else if (d !== "deliverable") {
      messages.push(
        `Lob reports "${d}" — the street address is deliverable but the unit may be wrong or missing. Confirm the suite or unit number.`,
      );
    }

    const normalized: MailAddress | null = result.primary_line
      ? {
          name: address.name,
          company: address.company ?? null,
          address1: result.primary_line,
          address2: result.secondary_line || null,
          city: result.components?.city ?? address.city,
          state: result.components?.state ?? address.state,
          postalCode: result.components?.zip_code ?? address.postalCode,
          country: "US",
        }
      : null;

    return { deliverable, normalized, messages };
  }

  async send(request: SendMailRequest): Promise<SendMailResult> {
    type LobLetter = {
      id: string;
      tracking_number?: string | null;
      expected_delivery_date?: string | null;
      url?: string | null;
    };

    // Lob accepts a PDF as a multipart file upload on the `file` field.
    const form = new FormData();
    form.set("description", request.description.slice(0, 255));
    form.set("color", "false");
    form.set("double_sided", "false");
    // Certified mail requires the address block to be part of the document or
    // an address placeholder page; Lob's default adds one.
    form.set("address_placement", "top_first_page");

    for (const [k, v] of Object.entries(toLobAddress(request.to))) {
      if (v !== undefined) form.set(`to[${k}]`, String(v));
    }
    for (const [k, v] of Object.entries(toLobAddress(request.from))) {
      if (v !== undefined) form.set(`from[${k}]`, String(v));
    }
    for (const [k, v] of Object.entries(mailOptions(request.mailClass))) {
      form.set(k, String(v));
    }

    form.set(
      "file",
      new Blob([request.pdf as unknown as BlobPart], { type: "application/pdf" }),
      "response.pdf",
    );

    const letter = await lobFetch<LobLetter>(this.env, "/letters", {
      method: "POST",
      body: form,
      idempotencyKey: request.idempotencyKey,
    });

    return {
      provider: this.id,
      providerJobId: letter.id,
      trackingNumber: letter.tracking_number ?? null,
      expectedDeliveryDate: letter.expected_delivery_date ?? null,
      proofUrl: letter.url ?? null,
    };
  }

  async getStatus(providerJobId: string): Promise<MailStatus> {
    type LobLetter = {
      id: string;
      tracking_number?: string | null;
      url?: string | null;
      tracking_events?: { name?: string; time?: string; date_created?: string }[];
    };

    const letter = await lobFetch<LobLetter>(this.env, `/letters/${providerJobId}`, {
      method: "GET",
    });

    const events = (letter.tracking_events ?? [])
      .map((e) => ({
        name: e.name ?? "unknown",
        occurredAt: e.time ?? e.date_created ?? "",
      }))
      .filter((e) => e.occurredAt)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    const delivered = events.find((e) => e.name.toLowerCase() === "delivered");

    return {
      provider: this.id,
      providerJobId: letter.id,
      // Latest event is the most useful single status.
      status: events.length > 0 ? events[events.length - 1].name : "created",
      trackingNumber: letter.tracking_number ?? null,
      events,
      proofUrl: letter.url ?? null,
      deliveredAt: delivered?.occurredAt ?? null,
    };
  }
}

/** True when Lob credentials are present. Lets callers fall back cleanly. */
export function isLobConfigured(env: LobEnv): boolean {
  return typeof env.LOB_API_KEY === "string" && env.LOB_API_KEY.trim().length > 0;
}

/** True when the configured key is a Lob test key — nothing physically mails. */
export function isLobTestMode(env: LobEnv): boolean {
  return (env.LOB_API_KEY ?? "").trim().startsWith("test_");
}
