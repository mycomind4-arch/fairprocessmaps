-- Migration 022: Notice Response vertical
-- Keeps the vertical on the canonical Case model without modifying legacy projects.

CREATE TABLE IF NOT EXISTS notice_responses (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  notice_type TEXT NOT NULL DEFAULT 'other',
  agency_name TEXT,
  notice_title TEXT,
  reference_number TEXT,
  received_date TEXT,
  response_deadline TEXT,
  recipient_name TEXT,
  recipient_address1 TEXT,
  recipient_address2 TEXT,
  recipient_city TEXT,
  recipient_state TEXT,
  recipient_postal_code TEXT,
  notice_text TEXT,
  r2_key TEXT,
  original_filename TEXT,
  content_type TEXT,
  sha256_hash TEXT,
  analysis_json TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  response_status TEXT NOT NULL DEFAULT 'not_started',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notice_response_case ON notice_responses(case_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_response_org ON notice_responses(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notice_response_deadline ON notice_responses(organization_id, response_deadline);
CREATE INDEX IF NOT EXISTS idx_notice_response_status ON notice_responses(organization_id, response_status, updated_at DESC);
