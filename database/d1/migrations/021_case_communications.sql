-- Case communications: the durable boundary between case work and physical execution.
-- FairProcessMaps owns intent, case context, document identity and timeline events.
-- Mail execution/provider state is represented here by opaque provider identifiers.

CREATE TABLE IF NOT EXISTS case_communications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  document_id TEXT,
  purpose TEXT NOT NULL,
  matter_reference TEXT,
  recipient_name TEXT NOT NULL,
  recipient_address_json TEXT NOT NULL,
  mail_type TEXT NOT NULL CHECK (mail_type IN ('first_class', 'certified', 'certified_return_receipt', 'registered')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'submitted', 'accepted', 'in_transit', 'delivered', 'failed', 'cancelled')),
  mailmypdf_job_id TEXT,
  tracking_number TEXT,
  proof_url TEXT,
  idempotency_key TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  delivered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_case_communications_org_idempotency
  ON case_communications(organization_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_case_communications_case
  ON case_communications(case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_communications_org_status
  ON case_communications(organization_id, status, updated_at DESC);
