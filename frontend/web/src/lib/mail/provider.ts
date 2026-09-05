/**
 * Mail provider interface.
 *
 * The case_communications table already carries `provider`, `provider_job_id`,
 * `tracking_number` and `proof_url`, so the schema always anticipated more than
 * one carrier. This is that seam made explicit: MailMyPDF and Lob are
 * interchangeable behind it, and a case records which one carried each letter.
 *
 * Why more than one provider is worth the abstraction: proof of service is
 * often worth more than the letter's contents. If a provider is down, or does
 * not offer certified mail with return receipt into a given jurisdiction, the
 * ability to fail over without touching the workflow is the difference between
 * meeting a deadline and missing it.
 */

export type MailClass =
  /** Proof of mailing and delivery. The default for anything legally operative. */
  | "certified"
  /** Certified plus a signed receipt card returned to sender. */
  | "certified_return_receipt"
  | "first_class"
  | "priority";

export interface MailAddress {
  name: string;
  company?: string | null;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export interface SendMailRequest {
  to: MailAddress;
  from: MailAddress;
  /** PDF bytes of the document to send. */
  pdf: Uint8Array;
  description: string;
  mailClass: MailClass;
  /**
   * Caller-generated key. Sending the same key twice must not produce two
   * letters — a duplicate legal filing is its own problem.
   */
  idempotencyKey: string;
}

export interface SendMailResult {
  provider: string;
  providerJobId: string;
  trackingNumber: string | null;
  /** Expected delivery date if the provider supplies one (ISO). */
  expectedDeliveryDate: string | null;
  /** URL to the rendered proof/thumbnail, when available. */
  proofUrl: string | null;
}

export interface MailStatus {
  provider: string;
  providerJobId: string;
  status: string;
  trackingNumber: string | null;
  /** Delivery events, oldest first. */
  events: { name: string; occurredAt: string }[];
  proofUrl: string | null;
  deliveredAt: string | null;
}

export interface AddressVerification {
  deliverable: boolean;
  /** Provider-normalized address, when it could be corrected. */
  normalized: MailAddress | null;
  /** Why an address is undeliverable, or what was changed. */
  messages: string[];
}

export interface MailProvider {
  readonly id: string;
  /**
   * Check an address before sending. Worth the extra call: a response returned
   * as undeliverable is functionally a response never sent, and the deadline
   * does not pause while the envelope comes back.
   */
  verifyAddress(address: MailAddress): Promise<AddressVerification>;
  send(request: SendMailRequest): Promise<SendMailResult>;
  getStatus(providerJobId: string): Promise<MailStatus>;
}
