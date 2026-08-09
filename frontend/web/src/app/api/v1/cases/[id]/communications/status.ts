// Internal integration helper: maps MailMyPDF lifecycle events to FairProcessMaps communication statuses.
// Kept separate from the webhook route so lifecycle mapping can be unit-tested without HTTP concerns.

export type MailMyPdfEvent =
  | "mail_job.created"
  | "mail_job.payment_completed"
  | "mail_job.queued"
  | "mail_job.submitted"
  | "mail_job.accepted"
  | "mail_job.in_transit"
  | "mail_job.delivered"
  | "mail_job.failed"
  | "mail_job.cancelled"
  | "mail_job.proof_available";

export type CaseCommunicationStatus =
  | "draft"
  | "payment_pending"
  | "queued"
  | "submitted"
  | "accepted"
  | "in_transit"
  | "delivered"
  | "failed"
  | "cancelled";

export function mapMailMyPdfEvent(event: MailMyPdfEvent): CaseCommunicationStatus {
  switch (event) {
    case "mail_job.payment_completed":
    case "mail_job.queued":
      return "queued";
    case "mail_job.submitted":
      return "submitted";
    case "mail_job.accepted":
      return "accepted";
    case "mail_job.in_transit":
      return "in_transit";
    case "mail_job.delivered":
    case "mail_job.proof_available":
      return "delivered";
    case "mail_job.failed":
      return "failed";
    case "mail_job.cancelled":
      return "cancelled";
    case "mail_job.created":
    default:
      return "draft";
  }
}
