-- 029_user_ai_and_property_enrichment.sql
-- Per-user Anthropic BYOK, auditable AI output provenance, and source-backed
-- property enrichment candidates. Secrets are encrypted by the Worker before
-- they are stored; plaintext provider keys never enter D1.

CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  model TEXT,
  encrypted_key TEXT,
  key_last4 TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_provenance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT,
  credential_scope TEXT NOT NULL CHECK (credential_scope IN ('user', 'organization', 'platform')),
  operation TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  populated_paths_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON ai_usage_provenance(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_resource
  ON ai_usage_provenance(resource_type, resource_id);

CREATE TABLE IF NOT EXISTS property_enrichment_candidates (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_date TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(property_id, field_name, value, source)
);

CREATE INDEX IF NOT EXISTS idx_property_enrichment_property
  ON property_enrichment_candidates(property_id, field_name, confidence DESC);
