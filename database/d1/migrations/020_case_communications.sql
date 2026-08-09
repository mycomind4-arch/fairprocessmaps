-- Migration 020: Case Communications
-- Establishes the durable boundary between FairProcessMaps case intelligence
-- and an external document-mail execution provider such as MailMyPDF.
-- Purely additive.

CREATE TABLE IF NOT EXISTS case_communications (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  mail_class TEXT NOT NULL DEFAULT 'certified',

  source_document_id TEXT,
  provider TEXT,
  provider_job_id TEXT,
  idempotency_key TEXT NOT NULL,

  recipient_name TEXT NOT NULL,
  recipient_company TEXT,
  recipient_address1 TEXT NOT NULL,
  recipient_address2 TEXT,
  recipient_city TEXT NOT NULL,
  recipient_state TEXT NOT NULL,
  recipient_postal_code TEXT NOT NULL,
  recipient_country TEXT NOT NULL DEFAULT 'US',

  matter_reference TEXT,
  tracking_number TEXT,
  proof_url TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_case_comm_case ON case_communications(case_id);
CREATE INDEX IF NOT EXISTS idx_case_comm_org ON case_communications(organization_id);
CREATE INDEX IF NOT EXISTS idx_case_comm_status ON case_communications(status);
CREATE INDEX IF NOT EXISTS idx_case_comm_provider_job ON case_communications(provider, provider_job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_comm_idempotency
  ON case_communications(organization_id, idempotency_key);

-- Mail lifecycle events become first-class timeline events.
INSERT OR IGNORE INTO event_types
  (id, code, category, label, description, is_timeline_visible, is_notification_worthy, is_audit_worthy, default_severity)
VALUES
  ('etp-mail-cr', 'mail_job.created', 'communication', 'Mail Job Created', 'A case communication was created for physical mailing', 1, 0, 1, 'info'),
  ('etp-mail-pc', 'mail_job.payment_completed', 'communication', 'Mail Payment Completed', 'Payment for a mail job was completed', 0, 0, 1, 'info'),
  ('etp-mail-q', 'mail_job.queued', 'communication', 'Mail Job Queued', 'A mail job was queued for provider fulfillment', 1, 0, 1, 'info'),
  ('etp-mail-s', 'mail_job.submitted', 'communication', 'Mail Submitted', 'A mail job was submitted to the physical-mail provider', 1, 1, 1, 'info'),
  ('etp-mail-a', 'mail_job.accepted', 'communication', 'Mail Accepted', 'The physical-mail provider accepted the mail job', 1, 1, 1, 'info'),
  ('etp-mail-t', 'mail_job.in_transit', 'communication', 'Mail In Transit', 'Tracking indicates the mail is in transit', 1, 0, 1, 'info'),
  ('etp-mail-d', 'mail_job.delivered', 'communication', 'Mail Delivered', 'Tracking indicates the mail was delivered', 1, 1, 1, 'info'),
  ('etp-mail-f', 'mail_job.failed', 'communication', 'Mail Failed', 'Physical-mail fulfillment failed', 1, 1, 1, 'warning'),
  ('etp-mail-c', 'mail_job.cancelled', 'communication', 'Mail Cancelled', 'A mail job was cancelled', 1, 1, 1, 'warning'),
  ('etp-mail-p', 'mail_job.proof_available', 'communication', 'Mail Proof Available', 'Proof of mailing or delivery became available', 1, 1, 1, 'info');
