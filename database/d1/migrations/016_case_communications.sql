-- Migration 016: Case communications / physical-mail lifecycle

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
  metadata TEXT,
  tracking_number TEXT,
  proof_url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  accepted_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_case_comm_case
  ON case_communications(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comm_org
  ON case_communications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comm_provider
  ON case_communications(provider, provider_job_id);
CREATE INDEX IF NOT EXISTS idx_case_comm_status
  ON case_communications(organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_comm_idempotency
  ON case_communications(organization_id, idempotency_key);
