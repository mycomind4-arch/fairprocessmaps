-- MailMyPDF webhook receipts.
-- Provider event IDs are the idempotency boundary for inbound lifecycle updates.

CREATE TABLE IF NOT EXISTS mailmypdf_webhook_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  communication_id TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mailmypdf_webhook_event_unique
  ON mailmypdf_webhook_events(organization_id, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_mailmypdf_webhook_comm
  ON mailmypdf_webhook_events(communication_id, received_at DESC);
